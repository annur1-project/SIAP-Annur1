import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import {
  addDaysIso,
  fetchTableWithFallback,
  formatHariTanggalIndo,
  formatRupiah,
  formatTanggalPendek,
  getLocalTodayStr,
  type DapurAbsenPetugas,
  type DapurKasItem,
  type DapurSesiMasak,
} from '@/lib/dapur';
import {
  fetchSarprasInventaris,
  fetchSarprasLaporan,
  type SarprasInventarisItem,
  type SarprasLaporanItem,
} from '@/lib/sarpras';
import {
  countPengisiProgress,
  fetchKegiatanAgenda,
  type KegiatanAgendaItem,
} from '@/lib/kegiatan';
import {
  DEFAULT_KAMAR_PONDOK,
  fetchLaundryCatatan,
  fetchLaundryJadwal,
  type LaundryCatatanItem,
  type LaundryJadwalKamar,
} from '@/lib/laundry';
import {
  computeWalletAndTransferSummary,
  readKeuanganLampiranMap,
  resolveTxLampiranUrl,
  type SyahriyahTransferSummary,
} from '@/lib/keuangan';

export { addDaysIso, formatHariTanggalIndo, formatRupiah, formatTanggalPendek, getLocalTodayStr };

export type PeriodeMode = 'mingguan' | 'bulanan' | 'rentang';

export type LaporanDivisionKey =
  | 'administrasi'
  | 'keuangan'
  | 'kegiatan'
  | 'perizinan'
  | 'keamanan'
  | 'jamaah'
  | 'kesehatan'
  | 'dapur'
  | 'sarpras'
  | 'laundry';

export type LaporanScope = 'gabungan' | LaporanDivisionKey;

export interface DivisionMeta {
  key: LaporanDivisionKey;
  label: string;
  shortLabel: string;
  romawi: string;
  pjDefault: string;
}

export const LAPORAN_DIVISIONS: DivisionMeta[] = [
  { key: 'administrasi', label: 'Administrasi & Santri', shortLabel: 'Administrasi', romawi: 'I', pjDefault: 'Sekretaris' },
  { key: 'keuangan', label: 'Keuangan Pesantren', shortLabel: 'Keuangan', romawi: 'II', pjDefault: 'Bendahara' },
  { key: 'kegiatan', label: 'Kegiatan Pondok', shortLabel: 'Kegiatan', romawi: 'III', pjDefault: 'Sie Kegiatan' },
  { key: 'perizinan', label: 'Perizinan Pulang', shortLabel: 'Perizinan', romawi: 'IV', pjDefault: 'Sie Keamanan' },
  { key: 'keamanan', label: 'Keamanan & Pelanggaran', shortLabel: 'Keamanan', romawi: 'V', pjDefault: 'Sie Keamanan' },
  { key: 'jamaah', label: 'Absen Sholat Jamaah', shortLabel: 'Sholat Jamaah', romawi: 'VI', pjDefault: 'Sie Ibadah' },
  { key: 'kesehatan', label: 'Kesehatan (Poskestren)', shortLabel: 'Poskestren', romawi: 'VII', pjDefault: 'Sie Kesehatan' },
  { key: 'dapur', label: 'Dapur & Konsumsi', shortLabel: 'Dapur', romawi: 'VIII', pjDefault: 'Sie Dapur' },
  { key: 'sarpras', label: 'Sarana & Prasarana', shortLabel: 'Sarpras', romawi: 'IX', pjDefault: 'Sie Sarpras' },
  { key: 'laundry', label: 'Sie Laundry Pondok', shortLabel: 'Sie Laundry', romawi: 'X', pjDefault: 'Sie Laundry' },
];

export interface PengaturanAplikasiRaw {
  id?: number;
  nama_pesantren?: string;
  alamat_lengkap?: string;
  no_telepon?: string;
  email_resmi?: string;
  logo_url?: string;
  kop_surat_url?: string;
  stempel_url?: string;
  nama_pengasuh?: string;
  ttd_pengasuh_url?: string;
  nama_kepala_pondok?: string;
  ttd_kepala_pondok_url?: string;
  nama_sekretaris?: string;
  ttd_sekretaris_url?: string;
  nama_bendahara?: string;
  ttd_bendahara_url?: string;
  jatuh_tempo_tanggal?: number;
  saldo_awal_pendaftaran?: number;
  saldo_awal_operasional?: number;
  saldo_awal_kas_pondok?: number;
  saldo_awal_mda?: number;
}

export interface SantriRaw {
  id: string;
  nis?: string;
  nama_lengkap: string;
  kamar?: string;
  status?: string;
  tarif_syahriyah?: number;
  tgl_masuk?: string | null;
  alamat_jalan?: string | null;
  desa?: string | null;
  kecamatan?: string | null;
  kabupaten?: string | null;
  catatan_keringanan?: string | null;
  ktl_nominal?: number | null;
  ktl_catatan?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface PengurusRaw {
  id: string;
  nama_lengkap: string;
  username?: string | null;
  role?: string | null;
  no_wa?: string | null;
  kamar_tugas?: string | null;
  nominal_bisyaroh?: number;
  status?: string;
  jabatan_list?: Array<{
    divisi?: string;
    nama_jabatan?: string;
    is_utama?: boolean;
  }>;
}

export interface KeuanganTransaksiRaw {
  id: string;
  santri_id?: string | null;
  dompet?: string;
  tipe: 'masuk' | 'keluar';
  kategori?: string;
  nominal: number;
  bulan_tagihan?: string | null;
  keterangan?: string | null;
  metode_pembayaran?: string;
  tgl_transaksi: string;
  no_kuitansi?: string | null;
  lampiran_url?: string | null;
  created_at?: string;
}

export interface PembayaranDetailRaw {
  id: string;
  santri_id: string;
  tahun_ajaran: string;
  item_kode: string;
  periode_bulan: string;
  label_item?: string;
  dompet?: string;
  nominal: number;
  is_migrasi?: boolean;
  no_kuitansi?: string | null;
  metode_pembayaran?: string;
  tgl_bayar?: string | null;
  created_at?: string;
}

export interface MasterPembayaranRaw {
  id: string;
  kode: string;
  nama_item: string;
  tipe_periode: 'bulanan' | 'tahunan';
  dompet_tujuan?: string;
  wajib_ndalem?: boolean;
  aktif?: boolean;
  urutan?: number;
}

export interface TarifRiwayatRaw {
  id: string;
  item_id: string;
  nominal: number;
  berlaku_mulai: string;
}

export interface IzinPulangRaw {
  id: string;
  santri_id: string;
  jenis_izin: 'tidak_menginap' | 'menginap';
  infaq_nominal?: number;
  tgl_pulang: string;
  tgl_rencana_kembali: string;
  tgl_aktual_kembali: string | null;
  alasan: string | null;
  status: 'disetujui' | 'kembali' | 'terlambat';
  created_at?: string;
}

export interface PelanggaranRaw {
  id: string;
  santri_id: string;
  nama_pelanggaran: string;
  tingkat: 'ringan' | 'sedang' | 'berat';
  poin: number;
  tanggal: string;
  kronologi?: string;
  takzir?: string;
  status_takzir?: 'belum_selesai' | 'selesai';
  petugas?: string;
  no_surat?: string;
}

export interface SitaBarangRaw {
  id: string;
  santri_id: string;
  nama_barang: string;
  kategori?: string;
  jumlah?: number;
  tgl_sita: string;
  lokasi_simpan?: string;
  petugas_penyita?: string;
  status: 'disita' | 'dikembalikan' | 'dimusnahkan';
  catatan?: string;
}

export interface AbsenJamaahRaw {
  id: string;
  santri_id: string;
  tgl: string;
  waktu_sholat: 'subuh' | 'dzuhur' | 'ashar' | 'maghrib' | 'isya';
  status: 'hadir' | 'alpha' | 'izin' | 'sakit';
  catatan?: string | null;
}

export interface SantriSakitRaw {
  id: string;
  santri_id: string;
  tgl_sakit: string;
  tgl_sembuh: string | null;
  keluhan: string;
  diagnosa?: string | null;
  tindakan?: string | null;
  status: 'rawat_uks' | 'dirujuk' | 'sembuh';
}

export interface ObatRaw {
  id: string;
  nama_obat: string;
  kategori: string;
  satuan: string;
  stok: number;
  stok_minimum: number;
  harga_satuan?: number;
  kadaluarsa?: string;
}

export interface PenyuluhanRaw {
  id: string;
  tanggal: string;
  judul: string;
  narasumber?: string;
  sasaran?: string;
  jumlah_peserta?: number;
  status: 'terjadwal' | 'terlaksana';
  ringkasan?: string;
}

export interface AllLaporanRawData {
  pengaturan: PengaturanAplikasiRaw;
  santri: SantriRaw[];
  pengurus: PengurusRaw[];
  transaksi: KeuanganTransaksiRaw[];
  pembayaranDetails: PembayaranDetailRaw[];
  masterPembayaran: MasterPembayaranRaw[];
  tarifRiwayat: TarifRiwayatRaw[];
  izinPulang: IzinPulangRaw[];
  pelanggaran: PelanggaranRaw[];
  sitaBarang: SitaBarangRaw[];
  absenJamaah: AbsenJamaahRaw[];
  santriSakit: SantriSakitRaw[];
  obatList: ObatRaw[];
  penyuluhan: PenyuluhanRaw[];
  dapurSesi: DapurSesiMasak[];
  dapurAbsen: DapurAbsenPetugas[];
  dapurKas: DapurKasItem[];
  sarprasInventaris: SarprasInventarisItem[];
  sarprasLaporan: SarprasLaporanItem[];
  kegiatanAgenda: KegiatanAgendaItem[];
  laundryCatatan: LaundryCatatanItem[];
  laundryJadwal: LaundryJadwalKamar[];
}

export interface PeriodWindow {
  mode: PeriodeMode;
  label: string;
  shortLabel: string;
  comparisonLabel: string;
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  dayCount: number;
}

export interface MetricDelta {
  current: number;
  previous: number;
  diff: number;
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
}

export interface PersonaliaGroup {
  dewanHarian: Array<{ jabatan: string; nama: string; noWa: string }>;
  plenoDivisi: Array<{ divisi: string; anggota: Array<{ nama: string; jabatan: string }> }>;
}

export interface AdministrasiSummary {
  kamarCounts: Array<{ kamar: string; jumlah: number }>;
  totalSantriAktif: number;
  totalSantriNdalem: number;
  totalPengurusAktif: number;
  totalKeseluruhan: number;
  santriNdalemList: Array<{ nama: string; kamar: string; keterangan: string }>;
  santriBoyongAll: Array<{ nama: string; kamar: string; keterangan: string }>;
  masukPeriodeIni: MetricDelta;
  santriBaruList: Array<{ nama: string; kamar: string; tglMasuk: string }>;
}

export interface KasLedgerRow {
  no: number;
  tanggal: string;
  uraian: string;
  bulan: string;
  debit: number;
  kredit: number;
  keterangan: string;
  saldo: number;
}

export interface KeuanganWeeklyBucket {
  mingguKe: number;
  label: string;
  rentang: string;
  tunaiSaldoAwal: number;
  tunaiDebit: number;
  tunaiKredit: number;
  tunaiSaldoAkhir: number;
  tunaiRows: KasLedgerRow[];
  transferDebit: number;
  transferKredit: number;
  transferSaldo: number;
  transferRows: Array<{
    no: number;
    tanggal: string;
    nama: string;
    nominal: number;
    keterangan: string;
    bukti: string;
  }>;
}

export interface TunggakanRow {
  santriId: string;
  nama: string;
  kamar: string;
  rentangBulan: string;
  jumlahBulan: number;
  tarifSpp: number;
  totalSyahriyah: number;
  totalTahunan: number;
  ktlSisa: number;
  totalSemua: number;
}

export interface LampiranNotaItem {
  id: string;
  tanggal: string;
  kategori: string;
  keterangan: string;
  dompetLabel: string;
  metode: 'tunai' | 'transfer';
  tipe: 'masuk' | 'keluar';
  nominal: number;
  url: string;
  noKuitansi?: string | null;
}

export interface KeuanganReport {
  masukTotal: MetricDelta;
  keluarTotal: MetricDelta;
  surplusTotal: MetricDelta;
  masukTunai: MetricDelta;
  masukTransfer: MetricDelta;
  saldoDompetSaatIni: {
    pendaftaran: number;
    operasional: number;
    kas_pondok: number;
    mda: number;
    total: number;
  };
  syahriyahTransfer: SyahriyahTransferSummary;
  saldoAwalPeriodeTunai: number;
  saldoAkhirPeriodeTunai: number;
  weeklyBuckets: KeuanganWeeklyBucket[];
  tunggakan1Bulan: TunggakanRow[];
  tunggakan2Bulan: TunggakanRow[];
  tunggakanLebih2Bulan: TunggakanRow[];
  totalTunggakanNominal: number;
  totalSantriMenunggak: number;
  pembayaranKesehatan: Array<{
    tanggal: string;
    nama: string;
    nominal: number;
    keterangan: string;
    metode: string;
  }>;
  santriLazis: Array<{ nama: string; kamar: string; keterangan: string }>;
  bisyarohList: Array<{ no: number; struktur: string; nama: string; jumlah: number }>;
  totalBisyaroh: number;
  lampiranNotaList: LampiranNotaItem[];
}

export interface KegiatanReport {
  totalAgenda: MetricDelta;
  selesaiCount: number;
  terjadwalCount: number;
  rutinCount: number;
  eventBesarCount: number;
  agendaList: Array<
    KegiatanAgendaItem & {
      pengisiProgress: ReturnType<typeof countPengisiProgress>;
    }
  >;
}

export interface PerizinanReport {
  totalIzin: MetricDelta;
  menginapCount: number;
  tidakMenginapCount: number;
  kembaliTepatCount: number;
  terlambatCount: MetricDelta;
  sedangPulangCount: number;
  totalInfaq: number;
  rows: Array<{
    no: number;
    nama: string;
    kamar: string;
    alamat: string;
    jenis: string;
    tglPulang: string;
    tglRencana: string;
    tglAktual: string;
    keperluan: string;
    statusLabel: string;
  }>;
}

export interface KeamananReport {
  totalKasus: MetricDelta;
  totalPoin: MetricDelta;
  ringanCount: number;
  sedangCount: number;
  beratCount: number;
  takzirSelesai: number;
  takzirBelum: number;
  sitaCount: MetricDelta;
  pelanggaranRows: Array<{
    no: number;
    tanggal: string;
    nama: string;
    kamar: string;
    pelanggaran: string;
    tingkat: string;
    poin: number;
    takzir: string;
    statusTakzir: string;
  }>;
  sitaRows: Array<{
    no: number;
    tglSita: string;
    nama: string;
    kamar: string;
    barang: string;
    kategori: string;
    jumlah: number;
    status: string;
  }>;
}

export interface JamaahReport {
  persenHadir: MetricDelta;
  totalRecord: number;
  hadirCount: number;
  alphaCount: MetricDelta;
  izinCount: number;
  sakitCount: number;
  perWaktu: Array<{
    waktu: string;
    hadir: number;
    alpha: number;
    izin: number;
    sakit: number;
    persenHadir: number;
  }>;
  topAlphaSantri: Array<{
    nama: string;
    kamar: string;
    alpha: number;
    izin: number;
    sakit: number;
  }>;
}

export interface KesehatanReport {
  totalSakit: MetricDelta;
  dirawatUks: number;
  dirujukCount: number;
  sembuhCount: number;
  obatMenipisCount: number;
  penyuluhanCount: number;
  pasienRows: Array<{
    no: number;
    tglSakit: string;
    nama: string;
    kamar: string;
    keluhan: string;
    tindakan: string;
    statusLabel: string;
  }>;
  obatMenipisRows: ObatRaw[];
  penyuluhanRows: PenyuluhanRaw[];
}

export interface DapurReport {
  persenTepatWaktu: MetricDelta;
  totalSesiSelesai: number;
  tepatWaktuCount: number;
  terlambatCount: number;
  persenHadirPetugas: MetricDelta;
  kasMasuk: number;
  kasKeluar: MetricDelta;
  kasSaldoPeriode: number;
  sesiRows: DapurSesiMasak[];
  kasRows: DapurKasItem[];
}

export interface SarprasReport {
  totalAsetUnit: number;
  asetBaikUnit: number;
  asetRusakUnit: number;
  tiketMasuk: MetricDelta;
  tiketSelesai: MetricDelta;
  biayaPerbaikan: MetricDelta;
  tiketAktifTotal: number;
  laporanRows: SarprasLaporanItem[];
  inventarisKondisiSummary: Array<{
    kategori: string;
    totalUnit: number;
    baik: number;
    rusakRingan: number;
    rusakBerat: number;
  }>;
}

export interface LaundryReport {
  totalSetoran: MetricDelta;
  totalPotong: MetricDelta;
  selesaiCount: number;
  masukCount: number;
  susulanCount: number;
  dailyRows: Array<{
    tanggal: string;
    hariLabel: string;
    totalKamar: number;
    totalPotong: number;
    selesaiCount: number;
    kamarDetail: string;
  }>;
  detailRows: LaundryCatatanItem[];
}

export interface ComparisonBarItem {
  label: string;
  unit: string;
  current: number;
  previous: number;
}

export interface TrendBucketPoint {
  label: string;
  startDate: string;
  endDate: string;
  keuanganMasukJuta: number;
  izinPulang: number;
  pelanggaran: number;
  jamaahPersen: number;
  santriSakit: number;
  laundryPotong: number;
}

export interface LaporanBundle {
  window: PeriodWindow;
  pengaturan: PengaturanAplikasiRaw;
  personalia: PersonaliaGroup;
  administrasi: AdministrasiSummary;
  keuangan: KeuanganReport;
  kegiatan: KegiatanReport;
  perizinan: PerizinanReport;
  keamanan: KeamananReport;
  jamaah: JamaahReport;
  kesehatan: KesehatanReport;
  dapur: DapurReport;
  sarpras: SarprasReport;
  laundry: LaundryReport;
  charts: {
    crossDivisionCounts: ComparisonBarItem[];
    keuanganComparison: ComparisonBarItem[];
    disiplinPersenComparison: ComparisonBarItem[];
    trendPoints: TrendBucketPoint[];
  };
}

const NAMA_BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const BULAN_TA_ORDER = [
  { index: 7, nama: 'Juli', tahunOffset: 0 },
  { index: 8, nama: 'Agustus', tahunOffset: 0 },
  { index: 9, nama: 'September', tahunOffset: 0 },
  { index: 10, nama: 'Oktober', tahunOffset: 0 },
  { index: 11, nama: 'November', tahunOffset: 0 },
  { index: 12, nama: 'Desember', tahunOffset: 0 },
  { index: 1, nama: 'Januari', tahunOffset: 1 },
  { index: 2, nama: 'Februari', tahunOffset: 1 },
  { index: 3, nama: 'Maret', tahunOffset: 1 },
  { index: 4, nama: 'April', tahunOffset: 1 },
  { index: 5, nama: 'Mei', tahunOffset: 1 },
  { index: 6, nama: 'Juni', tahunOffset: 1 },
];

export function formatBulanTahunIndo(yyyyMm: string): string {
  const [yStr, mStr] = yyyyMm.split('-');
  const m = parseInt(mStr || '1', 10);
  return `${NAMA_BULAN_ID[m - 1] || mStr} ${yStr}`;
}

export function getMonthLastDayIso(yyyyMm: string): string {
  const [yStr, mStr] = yyyyMm.split('-');
  const y = parseInt(yStr || '2026', 10);
  const m = parseInt(mStr || '1', 10);
  const lastDay = new Date(y, m, 0).getDate();
  return `${yStr}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export function diffDaysInclusive(startIso: string, endIso: string): number {
  const [y1, m1, d1] = startIso.split('-').map((n) => parseInt(n, 10));
  const [y2, m2, d2] = endIso.split('-').map((n) => parseInt(n, 10));
  const t1 = Date.UTC(y1, (m1 || 1) - 1, d1 || 1);
  const t2 = Date.UTC(y2, (m2 || 1) - 1, d2 || 1);
  const diff = Math.round((t2 - t1) / 86400000) + 1;
  return Math.max(1, diff);
}

/**
 * Mengembalikan tanggal hari Jum'at terdekat di pekan berjalan untuk rapat rutin pengasuh.
 * Jika hari ini Sabtu–Jum'at, mengembalikan Jum'at penutup pekan tersebut.
 */
export function getNearestFridayIso(todayIso: string): string {
  const [y, m, d] = todayIso.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const day = dt.getDay(); // 0=Ahad .. 5=Jum'at, 6=Sabtu
  const deltaToFriday = (5 - day + 7) % 7;
  return addDaysIso(todayIso, deltaToFriday);
}

export function computePeriodWindow(
  mode: PeriodeMode,
  opts: {
    anchorDate?: string;
    monthStr?: string;
    startDate?: string;
    endDate?: string;
    todayStr?: string;
  }
): PeriodWindow {
  const today = opts.todayStr || getLocalTodayStr();

  if (mode === 'mingguan') {
    const endDate = opts.anchorDate || today;
    const startDate = addDaysIso(endDate, -6);
    const prevEndDate = addDaysIso(startDate, -1);
    const prevStartDate = addDaysIso(prevEndDate, -6);
    return {
      mode,
      label: `Pekan Rapat Jum'at (${formatTanggalPendek(startDate)} – ${formatTanggalPendek(endDate)})`,
      shortLabel: `${formatTanggalPendek(startDate)} – ${formatTanggalPendek(endDate)}`,
      comparisonLabel: `vs Pekan Lalu (${formatTanggalPendek(prevStartDate)} – ${formatTanggalPendek(prevEndDate)})`,
      startDate,
      endDate,
      prevStartDate,
      prevEndDate,
      dayCount: 7,
    };
  }

  if (mode === 'bulanan') {
    const monthStr = opts.monthStr || today.slice(0, 7);
    const [yStr, mStr] = monthStr.split('-');
    const y = parseInt(yStr || '2026', 10);
    const m = parseInt(mStr || '1', 10);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = getMonthLastDayIso(monthStr);

    let prevY = y;
    let prevM = m - 1;
    if (prevM === 0) {
      prevM = 12;
      prevY -= 1;
    }
    const prevMonthStr = `${prevY}-${String(prevM).padStart(2, '0')}`;
    const prevStartDate = `${prevMonthStr}-01`;
    const prevEndDate = getMonthLastDayIso(prevMonthStr);

    return {
      mode,
      label: `Bulan ${formatBulanTahunIndo(monthStr)}`,
      shortLabel: formatBulanTahunIndo(monthStr),
      comparisonLabel: `vs ${formatBulanTahunIndo(prevMonthStr)}`,
      startDate,
      endDate,
      prevStartDate,
      prevEndDate,
      dayCount: diffDaysInclusive(startDate, endDate),
    };
  }

  const rawStart = opts.startDate || addDaysIso(today, -6);
  const rawEnd = opts.endDate || today;
  const startDate = rawStart <= rawEnd ? rawStart : rawEnd;
  const endDate = rawStart <= rawEnd ? rawEnd : rawStart;
  const span = diffDaysInclusive(startDate, endDate);
  const prevEndDate = addDaysIso(startDate, -1);
  const prevStartDate = addDaysIso(prevEndDate, -(span - 1));

  return {
    mode: 'rentang',
    label: `Periode ${formatTanggalPendek(startDate)} – ${formatTanggalPendek(endDate)}`,
    shortLabel: `${formatTanggalPendek(startDate)} – ${formatTanggalPendek(endDate)}`,
    comparisonLabel: `vs ${span} Hari Sebelumnya (${formatTanggalPendek(prevStartDate)} – ${formatTanggalPendek(prevEndDate)})`,
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    dayCount: span,
  };
}

export function computeDelta(current: number, previous: number): MetricDelta {
  const diff = current - previous;
  const pct =
    previous === 0
      ? current === 0
        ? 0
        : null
      : Math.round((diff / Math.abs(previous)) * 100);
  const direction: MetricDelta['direction'] =
    diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  return { current, previous, diff, pct, direction };
}

function inRange(iso: string | null | undefined, start: string, end: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= start && d <= end;
}

function getKamarSortWeight(kamar: string): number {
  const up = (kamar || '').toUpperCase().trim();
  const aMatch = up.match(/^A(\d+)$/);
  if (aMatch) return 100 + parseInt(aMatch[1], 10);
  const cMatch = up.match(/^C(\d+)$/);
  if (cMatch) return 200 + parseInt(cMatch[1], 10);
  if (up.includes('TAHFIDZ')) return 290;
  const vipMatch = up.match(/AL-?FACHRIYAH\s*(\d+)/);
  if (vipMatch) return 300 + parseInt(vipMatch[1], 10);
  if (up.includes('NDALEM')) return 400;
  return 500;
}

function isSuperAdminEntry(p: PengurusRaw): boolean {
  const uname = String(p.username || '').trim().toLowerCase();
  const role = String(p.role || '').trim().toLowerCase();
  const nama = String(p.nama_lengkap || '').trim().toLowerCase();
  return uname === 'admin.utama' || role === 'super_admin' || nama === 'admin utama pondok';
}

export function buildPersonaliaSummary(pengurusList: PengurusRaw[]): PersonaliaGroup {
  const aktif = pengurusList.filter(
    (p) => (p.status || 'aktif') === 'aktif' && !isSuperAdminEntry(p)
  );
  const dewanKeywords = ['ketua', 'wakil ketua', 'kepala pondok', 'sekretaris', 'bendahara'];

  const dewanHarian: PersonaliaGroup['dewanHarian'] = [];
  const divisiMap = new Map<string, Array<{ nama: string; jabatan: string }>>();

  for (const p of aktif) {
    const jabs = Array.isArray(p.jabatan_list) && p.jabatan_list.length > 0
      ? p.jabatan_list
      : [{ divisi: 'Pengurus Umum', nama_jabatan: 'Anggota', is_utama: true }];

    for (const j of jabs) {
      const divisi = (j.divisi || 'Pengurus Umum').trim();
      const jabatan = (j.nama_jabatan || divisi).trim();
      const lowerAll = `${divisi} ${jabatan}`.toLowerCase();

      if (
        divisi.toLowerCase().includes('dewan harian') ||
        dewanKeywords.some((kw) => lowerAll.includes(kw))
      ) {
        dewanHarian.push({
          jabatan: jabatan || divisi,
          nama: p.nama_lengkap,
          noWa: p.no_wa || '',
        });
      } else {
        if (!divisiMap.has(divisi)) divisiMap.set(divisi, []);
        const list = divisiMap.get(divisi)!;
        if (!list.some((item) => item.nama === p.nama_lengkap)) {
          list.push({
            nama: p.nama_lengkap,
            jabatan,
          });
        }
      }
    }
  }

  const getDewanOrder = (jabatan: string): number => {
    const low = jabatan.toLowerCase();
    if (low.includes('wakil ketua')) return 2;
    if (low.includes('ketua') || low.includes('kepala pondok')) return 1;
    if (low.includes('wakil sekretaris')) return 4;
    if (low.includes('sekretaris')) return 3;
    if (low.includes('wakil bendahara')) return 6;
    if (low.includes('bendahara')) return 5;
    return 99;
  };

  dewanHarian.sort((a, b) => getDewanOrder(a.jabatan) - getDewanOrder(b.jabatan));

  const plenoPriority = ['kegiatan', 'keamanan', 'kebersihan', 'kesehatan', 'poskestren', 'ibadah', 'jamaah', 'sarpras', 'dapur', 'laundry'];
  const getPlenoOrder = (divisi: string): number => {
    const low = divisi.toLowerCase();
    const idx = plenoPriority.findIndex((kw) => low.includes(kw));
    return idx >= 0 ? idx : 99;
  };

  const plenoDivisi = Array.from(divisiMap.entries())
    .sort((a, b) => {
      const oa = getPlenoOrder(a[0]);
      const ob = getPlenoOrder(b[0]);
      if (oa !== ob) return oa - ob;
      return a[0].localeCompare(b[0], 'id');
    })
    .map(([divisi, anggota]) => ({ divisi, anggota }));

  return { dewanHarian, plenoDivisi };
}

export function buildAdministrasiSummary(
  santriList: SantriRaw[],
  pengurusList: PengurusRaw[],
  window: PeriodWindow
): AdministrasiSummary {
  const aktifOrNdalem = santriList.filter(
    (s) => s.status === 'aktif' || s.status === 'ndalem' || s.status === 'beasiswa_lazis' || !s.status
  );
  const countMap = new Map<string, number>();

  for (const k of DEFAULT_KAMAR_PONDOK) {
    countMap.set(k, 0);
  }

  let totalSantriNdalem = 0;
  let totalSantriAktifNonNdalem = 0;
  const santriNdalemList: AdministrasiSummary['santriNdalemList'] = [];

  for (const s of aktifOrNdalem) {
    const kamar = (s.kamar || '').trim();
    if (s.status === 'ndalem' || kamar.toUpperCase() === 'NDALEM') {
      totalSantriNdalem += 1;
      santriNdalemList.push({
        nama: s.nama_lengkap,
        kamar: kamar || 'NDALEM',
        keterangan: s.catatan_keringanan || 'Ikut Ndalem',
      });
    } else {
      totalSantriAktifNonNdalem += 1;
      const key = kamar || 'Belum Berkamar';
      countMap.set(key, (countMap.get(key) || 0) + 1);
    }
  }

  const kamarCounts = Array.from(countMap.entries())
    .filter(([k, cnt]) => DEFAULT_KAMAR_PONDOK.includes(k) || cnt > 0)
    .sort((a, b) => {
      const wa = getKamarSortWeight(a[0]);
      const wb = getKamarSortWeight(b[0]);
      if (wa !== wb) return wa - wb;
      return a[0].localeCompare(b[0], 'id', { numeric: true });
    })
    .map(([kamar, jumlah]) => ({ kamar, jumlah }));

  const totalPengurusAktif = pengurusList.filter(
    (p) => (p.status || 'aktif') === 'aktif' && !isSuperAdminEntry(p)
  ).length;
  const santriBoyongAll = santriList
    .filter((s) => s.status === 'boyong' || s.status === 'pindah_al_burhany')
    .map((s) => ({
      nama: s.nama_lengkap,
      kamar: s.kamar || '-',
      keterangan: s.catatan_keringanan || (s.status === 'pindah_al_burhany' ? 'Pindah Al-Burhany' : 'Boyong'),
    }));

  const santriBaruCurr = santriList.filter((s) =>
    inRange(s.tgl_masuk, window.startDate, window.endDate)
  );
  const santriBaruPrev = santriList.filter((s) =>
    inRange(s.tgl_masuk, window.prevStartDate, window.prevEndDate)
  );

  return {
    kamarCounts,
    totalSantriAktif: totalSantriAktifNonNdalem,
    totalSantriNdalem,
    totalPengurusAktif,
    totalKeseluruhan: totalSantriAktifNonNdalem + totalSantriNdalem + totalPengurusAktif,
    santriNdalemList,
    santriBoyongAll,
    masukPeriodeIni: computeDelta(santriBaruCurr.length, santriBaruPrev.length),
    santriBaruList: santriBaruCurr.map((s) => ({
      nama: s.nama_lengkap,
      kamar: s.kamar || '-',
      tglMasuk: s.tgl_masuk || '-',
    })),
  };
}

function getSantriKategoriTagihan(santri: SantriRaw): 'ndalem' | 'vip' | 'reguler' {
  const kamar = (santri.kamar || '').toUpperCase();
  if (santri.status === 'ndalem' || kamar === 'NDALEM') return 'ndalem';
  if (kamar.includes('VIP') || kamar.includes('FACHRIYAH')) return 'vip';
  return 'reguler';
}

function getActiveTahunAjaran(refIsoDate: string): string {
  const [yStr, mStr] = refIsoDate.split('-');
  const y = parseInt(yStr || '2026', 10);
  const m = parseInt(mStr || '7', 10);
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}/${startYear + 1}`;
}

function isBisyarohTx(tx: KeuanganTransaksiRaw): boolean {
  const hay = `${tx.kategori || ''} ${tx.keterangan || ''}`.toLowerCase();
  return hay.includes('bisyaroh');
}

export function buildKeuanganReport(
  transaksiList: KeuanganTransaksiRaw[],
  pembayaranDetails: PembayaranDetailRaw[],
  masterPembayaran: MasterPembayaranRaw[],
  tarifRiwayat: TarifRiwayatRaw[],
  santriList: SantriRaw[],
  pengurusList: PengurusRaw[],
  pengaturan: PengaturanAplikasiRaw,
  window: PeriodWindow,
  todayStr: string,
  options?: { canViewBisyaroh?: boolean }
): KeuanganReport {
  const canViewBisyaroh = options?.canViewBisyaroh !== false;
  const visibleTransaksiList = canViewBisyaroh
    ? transaksiList
    : transaksiList.filter((tx) => !isBisyarohTx(tx));
  const santriMap = new Map<string, SantriRaw>(santriList.map((s) => [s.id, s]));
  const localLampiranMap = readKeuanganLampiranMap();

  // 1. Saldo 4 dompet (KHUSUS TUNAI) & kartu laporan terpisah `Pemasukan Transfer`
  const walletSplitSummary = computeWalletAndTransferSummary(
    visibleTransaksiList,
    {
      pendaftaran: Number(pengaturan.saldo_awal_pendaftaran || 0),
      operasional: Number(pengaturan.saldo_awal_operasional || 0),
      kas_pondok: Number(pengaturan.saldo_awal_kas_pondok || 0),
      mda: Number(pengaturan.saldo_awal_mda || 0),
    },
    todayStr.slice(0, 7)
  );

  const saldoDompet = {
    pendaftaran: walletSplitSummary.totals.pendaftaran,
    operasional: walletSplitSummary.totals.operasional,
    kas_pondok: walletSplitSummary.totals.kas_pondok,
    mda: walletSplitSummary.totals.mda,
    total: walletSplitSummary.grandTotalTunai,
  };

  // 2. Arus kas periode ini vs periode lalu
  const currTx = visibleTransaksiList.filter((tx) =>
    inRange(tx.tgl_transaksi, window.startDate, window.endDate)
  );
  const prevTx = visibleTransaksiList.filter((tx) =>
    inRange(tx.tgl_transaksi, window.prevStartDate, window.prevEndDate)
  );

  let currMasuk = 0;
  let currKeluar = 0;
  let currTunaiMasuk = 0;
  let currTransferMasuk = 0;

  for (const tx of currTx) {
    const nom = Number(tx.nominal || 0);
    if (tx.tipe === 'masuk') {
      currMasuk += nom;
      if (tx.metode_pembayaran === 'transfer') currTransferMasuk += nom;
      else currTunaiMasuk += nom;
    } else {
      currKeluar += nom;
    }
  }

  let prevMasuk = 0;
  let prevKeluar = 0;
  let prevTunaiMasuk = 0;
  let prevTransferMasuk = 0;

  for (const tx of prevTx) {
    const nom = Number(tx.nominal || 0);
    if (tx.tipe === 'masuk') {
      prevMasuk += nom;
      if (tx.metode_pembayaran === 'transfer') prevTransferMasuk += nom;
      else prevTunaiMasuk += nom;
    } else {
      prevKeluar += nom;
    }
  }

  // 3. Saldo awal kas tunai sebelum window.startDate
  let saldoTunaiSebelumPeriode =
    Number(pengaturan.saldo_awal_pendaftaran || 0) +
    Number(pengaturan.saldo_awal_operasional || 0) +
    Number(pengaturan.saldo_awal_kas_pondok || 0) +
    Number(pengaturan.saldo_awal_mda || 0);

  for (const tx of visibleTransaksiList) {
    if ((tx.tgl_transaksi || '') < window.startDate && tx.metode_pembayaran !== 'transfer') {
      const nom = Number(tx.nominal || 0);
      saldoTunaiSebelumPeriode += tx.tipe === 'masuk' ? nom : -nom;
    }
  }

  // 4. Pembagian Mingguan (Minggu 1..4) untuk mode bulanan, atau 1 blok/rentang untuk mingguan/rentang
  const sortedCurrTx = [...currTx].sort((a, b) =>
    (a.tgl_transaksi || '').localeCompare(b.tgl_transaksi || '')
  );

  const weeklyBuckets: KeuanganWeeklyBucket[] = [];
  if (window.mode === 'bulanan') {
    const ym = window.startDate.slice(0, 7);
    const lastDay = parseInt(window.endDate.slice(8, 10), 10);
    const ranges = [
      { ke: 1, start: `${ym}-01`, end: `${ym}-07`, label: 'Minggu 1 (Tgl 1–7)' },
      { ke: 2, start: `${ym}-08`, end: `${ym}-14`, label: 'Minggu 2 (Tgl 8–14)' },
      { ke: 3, start: `${ym}-15`, end: `${ym}-21`, label: 'Minggu 3 (Tgl 15–21)' },
      {
        ke: 4,
        start: `${ym}-22`,
        end: `${ym}-${String(lastDay).padStart(2, '0')}`,
        label: `Minggu 4 (Tgl 22–${lastDay})`,
      },
    ];

    let runningTunai = saldoTunaiSebelumPeriode;
    for (const rng of ranges) {
      const startSaldo = runningTunai;
      let tDebit = 0;
      let tKredit = 0;
      const tunaiRows: KasLedgerRow[] = [];

      let tfDebit = 0;
      let tfKredit = 0;
      const transferRows: KeuanganWeeklyBucket['transferRows'] = [];

      const weekTxs = sortedCurrTx.filter((tx) =>
        inRange(tx.tgl_transaksi, rng.start, rng.end)
      );

      for (const tx of weekTxs) {
        const nom = Number(tx.nominal || 0);
        const santriName = tx.santri_id ? santriMap.get(tx.santri_id)?.nama_lengkap : '';
        const uraian = santriName || tx.kategori || tx.keterangan || '-';
        const ket = santriName ? tx.kategori || tx.keterangan || '' : tx.keterangan || '';

        if (tx.metode_pembayaran === 'transfer') {
          if (tx.tipe === 'masuk') {
            tfDebit += nom;
            const scanUrl = resolveTxLampiranUrl(tx, localLampiranMap);
            transferRows.push({
              no: transferRows.length + 1,
              tanggal: tx.tgl_transaksi,
              nama: uraian,
              nominal: nom,
              keterangan: tx.bulan_tagihan || ket || '-',
              bukti: scanUrl ? 'ADA SCAN' : tx.no_kuitansi ? 'KUITANSI' : '-',
            });
          } else {
            tfKredit += nom;
          }
        } else {
          const debit = tx.tipe === 'masuk' ? nom : 0;
          const kredit = tx.tipe === 'keluar' ? nom : 0;
          tDebit += debit;
          tKredit += kredit;
          runningTunai += debit - kredit;
          tunaiRows.push({
            no: tunaiRows.length + 1,
            tanggal: tx.tgl_transaksi,
            uraian,
            bulan: tx.bulan_tagihan || '',
            debit,
            kredit,
            keterangan: ket,
            saldo: runningTunai,
          });
        }
      }

      weeklyBuckets.push({
        mingguKe: rng.ke,
        label: rng.label,
        rentang: `${formatTanggalPendek(rng.start)} – ${formatTanggalPendek(rng.end)}`,
        tunaiSaldoAwal: startSaldo,
        tunaiDebit: tDebit,
        tunaiKredit: tKredit,
        tunaiSaldoAkhir: runningTunai,
        tunaiRows,
        transferDebit: tfDebit,
        transferKredit: tfKredit,
        transferSaldo: tfDebit - tfKredit,
        transferRows,
      });
    }
  } else {
    let runningTunai = saldoTunaiSebelumPeriode;
    let tDebit = 0;
    let tKredit = 0;
    const tunaiRows: KasLedgerRow[] = [];
    let tfDebit = 0;
    let tfKredit = 0;
    const transferRows: KeuanganWeeklyBucket['transferRows'] = [];

    for (const tx of sortedCurrTx) {
      const nom = Number(tx.nominal || 0);
      const santriName = tx.santri_id ? santriMap.get(tx.santri_id)?.nama_lengkap : '';
      const uraian = santriName || tx.kategori || tx.keterangan || '-';
      const ket = santriName ? tx.kategori || tx.keterangan || '' : tx.keterangan || '';

      if (tx.metode_pembayaran === 'transfer') {
        if (tx.tipe === 'masuk') {
          tfDebit += nom;
          const scanUrl = resolveTxLampiranUrl(tx, localLampiranMap);
          transferRows.push({
            no: transferRows.length + 1,
            tanggal: tx.tgl_transaksi,
            nama: uraian,
            nominal: nom,
            keterangan: tx.bulan_tagihan || ket || '-',
            bukti: scanUrl ? 'ADA SCAN' : tx.no_kuitansi ? 'KUITANSI' : '-',
          });
        } else {
          tfKredit += nom;
        }
      } else {
        const debit = tx.tipe === 'masuk' ? nom : 0;
        const kredit = tx.tipe === 'keluar' ? nom : 0;
        tDebit += debit;
        tKredit += kredit;
        runningTunai += debit - kredit;
        tunaiRows.push({
          no: tunaiRows.length + 1,
          tanggal: tx.tgl_transaksi,
          uraian,
          bulan: tx.bulan_tagihan || '',
          debit,
          kredit,
          keterangan: ket,
          saldo: runningTunai,
        });
      }
    }

    weeklyBuckets.push({
      mingguKe: 1,
      label: window.mode === 'mingguan' ? 'Mutasi Pekan Ini' : 'Mutasi Rentang Periode',
      rentang: window.shortLabel,
      tunaiSaldoAwal: saldoTunaiSebelumPeriode,
      tunaiDebit: tDebit,
      tunaiKredit: tKredit,
      tunaiSaldoAkhir: runningTunai,
      tunaiRows,
      transferDebit: tfDebit,
      transferKredit: tfKredit,
      transferSaldo: tfDebit - tfKredit,
      transferRows,
    });
  }

  const saldoAkhirPeriodeTunai =
    weeklyBuckets.length > 0
      ? weeklyBuckets[weeklyBuckets.length - 1].tunaiSaldoAkhir
      : saldoTunaiSebelumPeriode;

  // 5. Hitung Tunggakan Syahriah 1 Bulan / 2 Bulan / > 2 Bulan
  const refDate = window.endDate || todayStr;
  const tahunAjaran = getActiveTahunAjaran(refDate);
  const startYearTa = parseInt(tahunAjaran.split('/')[0] || '2026', 10);
  const periodeListTA = BULAN_TA_ORDER.map((b) => {
    const yr = startYearTa + b.tahunOffset;
    const periode = `${yr}-${String(b.index).padStart(2, '0')}`;
    return { ...b, tahun: yr, periode };
  });

  const [refY, refM, refD] = refDate.split('-').map((n) => parseInt(n, 10));
  const jatuhTempo = Number(pengaturan.jatuh_tempo_tanggal || 10);
  let cutY = refY || 2026;
  let cutM = (refD || 15) > jatuhTempo ? refM || 11 : (refM || 11) - 1;
  if (cutM <= 0) {
    cutM = 12;
    cutY -= 1;
  }
  const cutoffPeriode = `${cutY}-${String(cutM).padStart(2, '0')}`;

  const masterByKode = new Map<string, MasterPembayaranRaw>(
    masterPembayaran.map((m) => [m.kode, m])
  );
  const riwayatByItem = new Map<string, TarifRiwayatRaw[]>();
  for (const r of tarifRiwayat) {
    if (!riwayatByItem.has(r.item_id)) riwayatByItem.set(r.item_id, []);
    riwayatByItem.get(r.item_id)!.push(r);
  }

  const getTarif = (kode: string, dateIso: string, fallback: number): number => {
    const item = masterByKode.get(kode);
    if (!item) return fallback;
    const hist = (riwayatByItem.get(item.id) || [])
      .filter((h) => h.berlaku_mulai <= dateIso)
      .sort((a, b) => b.berlaku_mulai.localeCompare(a.berlaku_mulai));
    return hist.length > 0 ? Number(hist[0].nominal) : fallback;
  };

  const paidBySantri = new Map<string, Set<string>>();
  for (const d of pembayaranDetails) {
    if (d.tahun_ajaran !== tahunAjaran) continue;
    if (!paidBySantri.has(d.santri_id)) paidBySantri.set(d.santri_id, new Set());
    paidBySantri.get(d.santri_id)!.add(`${d.item_kode}__${d.periode_bulan}`);
  }

  const tunggakan1Bulan: TunggakanRow[] = [];
  const tunggakan2Bulan: TunggakanRow[] = [];
  const tunggakanLebih2Bulan: TunggakanRow[] = [];

  for (const s of santriList) {
    if (s.status === 'boyong' || s.status === 'alumni' || s.status === 'pindah_al_burhany') continue;
    const paid = paidBySantri.get(s.id) || new Set<string>();
    const kategori = getSantriKategoriTagihan(s);
    const belumBulan: Array<{ periode: string; nama: string; nominal: number }> = [];

    for (const p of periodeListTA) {
      if (p.periode <= cutoffPeriode && !paid.has(`syahriyah__${p.periode}`)) {
        const eff = `${p.periode}-01`;
        let nom = Number(s.tarif_syahriyah || 0);
        if (nom <= 0) {
          if (kategori === 'ndalem') nom = getTarif('syahriyah_ndalem', eff, 145000);
          else if (kategori === 'vip') nom = getTarif('syahriyah_vip', eff, 475000);
          else nom = getTarif('syahriyah_reguler', eff, 425000);
        }
        belumBulan.push({ periode: p.periode, nama: p.nama, nominal: nom });
      }
    }

    const totalSyah = belumBulan.reduce((a, b) => a + b.nominal, 0);
    const ktl = Number(s.ktl_nominal || 0);
    if (belumBulan.length === 0 && ktl === 0) continue;

    const rentangBulan =
      belumBulan.length === 1
        ? belumBulan[0].nama.toUpperCase()
        : belumBulan.length > 1
        ? `${belumBulan[0].nama.toUpperCase()} - ${belumBulan[belumBulan.length - 1].nama.toUpperCase()}`
        : 'KTL';

    const row: TunggakanRow = {
      santriId: s.id,
      nama: s.nama_lengkap,
      kamar: s.kamar || '-',
      rentangBulan,
      jumlahBulan: belumBulan.length,
      tarifSpp: belumBulan[0]?.nominal || Number(s.tarif_syahriyah || 425000),
      totalSyahriyah: totalSyah,
      totalTahunan: 0,
      ktlSisa: ktl,
      totalSemua: totalSyah + ktl,
    };

    if (belumBulan.length >= 3) tunggakanLebih2Bulan.push(row);
    else if (belumBulan.length === 2) tunggakan2Bulan.push(row);
    else tunggakan1Bulan.push(row);
  }

  const totalTunggakanNominal = [...tunggakan1Bulan, ...tunggakan2Bulan, ...tunggakanLebih2Bulan].reduce(
    (sum, r) => sum + r.totalSemua,
    0
  );

  // 6. Pembayaran Kesehatan, Santri LAZIZ, dan Bisyaroh
  const pembayaranKesehatan = currTx
    .filter(
      (tx) =>
        tx.tipe === 'masuk' &&
        ((tx.kategori || '').toLowerCase().includes('kesehatan') ||
          (tx.keterangan || '').toLowerCase().includes('kesehatan'))
    )
    .map((tx) => ({
      tanggal: tx.tgl_transaksi,
      nama: (tx.santri_id ? santriMap.get(tx.santri_id)?.nama_lengkap : '') || tx.kategori || '-',
      nominal: Number(tx.nominal || 0),
      keterangan: tx.keterangan || tx.kategori || 'Pembayaran Kesehatan',
      metode: tx.metode_pembayaran === 'transfer' ? 'TRANSFER' : 'TUNAI',
    }));

  const santriLazis = santriList
    .filter((s) => s.status === 'beasiswa_lazis')
    .map((s) => ({
      nama: s.nama_lengkap,
      kamar: s.kamar || '-',
      keterangan: s.catatan_keringanan || 'Penerima Beasiswa LAZIZ',
    }));

  const bisyarohList = canViewBisyaroh
    ? pengurusList
        .filter((p) => (p.status || 'aktif') === 'aktif' && Number(p.nominal_bisyaroh || 0) > 0)
        .map((p, idx) => {
          const utama = p.jabatan_list?.find((j) => j.is_utama) || p.jabatan_list?.[0];
          return {
            no: idx + 1,
            struktur: utama ? `${utama.nama_jabatan || utama.divisi}` : 'Pengurus Pondok',
            nama: p.nama_lengkap,
            jumlah: Number(p.nominal_bisyaroh || 0),
          };
        })
    : [];
  const totalBisyaroh = bisyarohList.reduce((sum, b) => sum + b.jumlah, 0);

  const dompetLabelMap: Record<string, string> = {
    pendaftaran: 'Dompet Pendaftaran',
    operasional: 'Dompet Syahriyah',
    kas_pondok: 'Dompet Kas Umum',
    mda: 'Dompet MDA',
  };

  const lampiranNotaList: LampiranNotaItem[] = [];
  for (const tx of sortedCurrTx) {
    const url = resolveTxLampiranUrl(tx, localLampiranMap);
    if (!url) continue;
    const santriName = tx.santri_id ? santriMap.get(tx.santri_id)?.nama_lengkap : '';
    lampiranNotaList.push({
      id: tx.id,
      tanggal: tx.tgl_transaksi,
      kategori: tx.kategori || 'Transaksi Keuangan',
      keterangan: santriName
        ? `${santriName} — ${tx.keterangan || tx.bulan_tagihan || ''}`.trim()
        : tx.keterangan || tx.bulan_tagihan || '-',
      dompetLabel:
        tx.metode_pembayaran === 'transfer'
          ? 'Pemasukan Transfer'
          : dompetLabelMap[tx.dompet || 'operasional'] || 'Dompet Syahriyah',
      metode: tx.metode_pembayaran === 'transfer' ? 'transfer' : 'tunai',
      tipe: tx.tipe,
      nominal: Number(tx.nominal || 0),
      url,
      noKuitansi: tx.no_kuitansi,
    });
  }

  return {
    masukTotal: computeDelta(currMasuk, prevMasuk),
    keluarTotal: computeDelta(currKeluar, prevKeluar),
    surplusTotal: computeDelta(currMasuk - currKeluar, prevMasuk - prevKeluar),
    masukTunai: computeDelta(currTunaiMasuk, prevTunaiMasuk),
    masukTransfer: computeDelta(currTransferMasuk, prevTransferMasuk),
    saldoDompetSaatIni: saldoDompet,
    syahriyahTransfer: walletSplitSummary.syahriyahTransfer,
    saldoAwalPeriodeTunai: saldoTunaiSebelumPeriode,
    saldoAkhirPeriodeTunai,
    weeklyBuckets,
    tunggakan1Bulan,
    tunggakan2Bulan,
    tunggakanLebih2Bulan,
    totalTunggakanNominal,
    totalSantriMenunggak:
      tunggakan1Bulan.length + tunggakan2Bulan.length + tunggakanLebih2Bulan.length,
    pembayaranKesehatan,
    santriLazis,
    bisyarohList,
    totalBisyaroh,
    lampiranNotaList,
  };
}

export function buildKegiatanReport(
  agendaList: KegiatanAgendaItem[],
  window: PeriodWindow
): KegiatanReport {
  const curr = agendaList
    .filter((a) => inRange(a.tanggal, window.startDate, window.endDate))
    .sort((a, b) => `${a.tanggal} ${a.jam_mulai}`.localeCompare(`${b.tanggal} ${b.jam_mulai}`));
  const prev = agendaList.filter((a) =>
    inRange(a.tanggal, window.prevStartDate, window.prevEndDate)
  );

  return {
    totalAgenda: computeDelta(curr.length, prev.length),
    selesaiCount: curr.filter((a) => a.status === 'selesai').length,
    terjadwalCount: curr.filter((a) => a.status === 'terjadwal' || a.status === 'berlangsung').length,
    rutinCount: curr.filter((a) => a.kategori === 'rutin').length,
    eventBesarCount: curr.filter((a) => a.kategori === 'event_besar').length,
    agendaList: curr.map((a) => ({
      ...a,
      pengisiProgress: countPengisiProgress(a.pengisi_list),
    })),
  };
}

export function buildPerizinanReport(
  izinList: IzinPulangRaw[],
  santriMap: Map<string, SantriRaw>,
  window: PeriodWindow
): PerizinanReport {
  const curr = izinList.filter((i) =>
    inRange(i.tgl_pulang, window.startDate, window.endDate)
  );
  const prev = izinList.filter((i) =>
    inRange(i.tgl_pulang, window.prevStartDate, window.prevEndDate)
  );

  const currTerlambat = curr.filter((i) => i.status === 'terlambat').length;
  const prevTerlambat = prev.filter((i) => i.status === 'terlambat').length;

  return {
    totalIzin: computeDelta(curr.length, prev.length),
    menginapCount: curr.filter((i) => i.jenis_izin === 'menginap').length,
    tidakMenginapCount: curr.filter((i) => i.jenis_izin === 'tidak_menginap').length,
    kembaliTepatCount: curr.filter((i) => i.status === 'kembali').length,
    terlambatCount: computeDelta(currTerlambat, prevTerlambat),
    sedangPulangCount: curr.filter((i) => i.status === 'disetujui').length,
    totalInfaq: curr.reduce((s, i) => s + Number(i.infaq_nominal || 0), 0),
    rows: curr
      .sort((a, b) => (a.tgl_pulang || '').localeCompare(b.tgl_pulang || ''))
      .map((i, idx) => {
        const s = santriMap.get(i.santri_id);
        const alamat = [s?.desa, s?.kecamatan, s?.kabupaten].filter(Boolean).join(', ') || s?.alamat_jalan || '-';
        let alasanBersih = i.alasan || '-';
        if (alasanBersih.startsWith('[IZIN_META:')) {
          const endIdx = alasanBersih.indexOf(']');
          if (endIdx !== -1) alasanBersih = alasanBersih.slice(endIdx + 1).trim() || '-';
        }
        return {
          no: idx + 1,
          nama: s?.nama_lengkap || 'Santri',
          kamar: s?.kamar || '-',
          alamat,
          jenis: i.jenis_izin === 'menginap' ? 'Menginap' : 'Keluar/Tidak Menginap',
          tglPulang: formatTanggalPendek(i.tgl_pulang),
          tglRencana: formatTanggalPendek(i.tgl_rencana_kembali),
          tglAktual: i.tgl_aktual_kembali ? formatTanggalPendek(i.tgl_aktual_kembali) : 'Belum Kembali',
          keperluan: alasanBersih,
          statusLabel:
            i.status === 'kembali'
              ? 'Kembali'
              : i.status === 'terlambat'
              ? 'Terlambat'
              : 'Sedang Pulang',
        };
      }),
  };
}

export function buildKeamananReport(
  pelanggaranList: PelanggaranRaw[],
  sitaList: SitaBarangRaw[],
  santriMap: Map<string, SantriRaw>,
  window: PeriodWindow
): KeamananReport {
  const curr = pelanggaranList.filter((p) =>
    inRange(p.tanggal, window.startDate, window.endDate)
  );
  const prev = pelanggaranList.filter((p) =>
    inRange(p.tanggal, window.prevStartDate, window.prevEndDate)
  );
  const currPoin = curr.reduce((sum, p) => sum + Number(p.poin || 0), 0);
  const prevPoin = prev.reduce((sum, p) => sum + Number(p.poin || 0), 0);

  const currSita = sitaList.filter((s) => inRange(s.tgl_sita, window.startDate, window.endDate));
  const prevSita = sitaList.filter((s) =>
    inRange(s.tgl_sita, window.prevStartDate, window.prevEndDate)
  );

  return {
    totalKasus: computeDelta(curr.length, prev.length),
    totalPoin: computeDelta(currPoin, prevPoin),
    ringanCount: curr.filter((p) => p.tingkat === 'ringan').length,
    sedangCount: curr.filter((p) => p.tingkat === 'sedang').length,
    beratCount: curr.filter((p) => p.tingkat === 'berat').length,
    takzirSelesai: curr.filter((p) => p.status_takzir === 'selesai').length,
    takzirBelum: curr.filter((p) => p.status_takzir !== 'selesai').length,
    sitaCount: computeDelta(currSita.length, prevSita.length),
    pelanggaranRows: curr
      .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''))
      .map((p, idx) => {
        const s = santriMap.get(p.santri_id);
        return {
          no: idx + 1,
          tanggal: formatTanggalPendek(p.tanggal),
          nama: s?.nama_lengkap || 'Santri',
          kamar: s?.kamar || '-',
          pelanggaran: p.nama_pelanggaran,
          tingkat: p.tingkat.toUpperCase(),
          poin: Number(p.poin || 0),
          takzir: p.takzir || '-',
          statusTakzir: p.status_takzir === 'selesai' ? 'Selesai' : 'Proses/Belum',
        };
      }),
    sitaRows: currSita.map((st, idx) => {
      const s = santriMap.get(st.santri_id);
      return {
        no: idx + 1,
        tglSita: formatTanggalPendek(st.tgl_sita),
        nama: s?.nama_lengkap || 'Santri',
        kamar: s?.kamar || '-',
        barang: st.nama_barang,
        kategori: st.kategori || '-',
        jumlah: Number(st.jumlah || 1),
        status: st.status === 'dikembalikan' ? 'Dikembalikan' : st.status === 'dimusnahkan' ? 'Dimusnahkan' : 'Disita',
      };
    }),
  };
}

export function buildJamaahReport(
  absenList: AbsenJamaahRaw[],
  santriMap: Map<string, SantriRaw>,
  window: PeriodWindow
): JamaahReport {
  const curr = absenList.filter((a) => inRange(a.tgl, window.startDate, window.endDate));
  const prev = absenList.filter((a) => inRange(a.tgl, window.prevStartDate, window.prevEndDate));

  const calcStats = (list: AbsenJamaahRaw[]) => {
    let hadir = 0;
    let alpha = 0;
    let izin = 0;
    let sakit = 0;
    for (const a of list) {
      if (a.status === 'hadir') hadir += 1;
      else if (a.status === 'alpha') alpha += 1;
      else if (a.status === 'izin') izin += 1;
      else if (a.status === 'sakit') sakit += 1;
    }
    const total = list.length;
    const pct = total > 0 ? Math.round((hadir / total) * 100) : 0;
    return { hadir, alpha, izin, sakit, total, pct };
  };

  const cStat = calcStats(curr);
  const pStat = calcStats(prev);

  const waktuList: Array<{ key: AbsenJamaahRaw['waktu_sholat']; label: string }> = [
    { key: 'subuh', label: 'Subuh' },
    { key: 'dzuhur', label: 'Dzuhur' },
    { key: 'ashar', label: 'Ashar' },
    { key: 'maghrib', label: 'Maghrib' },
    { key: 'isya', label: 'Isya' },
  ];

  const perWaktu = waktuList.map((w) => {
    const sub = curr.filter((a) => a.waktu_sholat === w.key);
    const st = calcStats(sub);
    return {
      waktu: w.label,
      hadir: st.hadir,
      alpha: st.alpha,
      izin: st.izin,
      sakit: st.sakit,
      persenHadir: st.pct,
    };
  });

  const santriAlphaMap = new Map<
    string,
    { nama: string; kamar: string; alpha: number; izin: number; sakit: number }
  >();
  for (const a of curr) {
    if (a.status === 'hadir') continue;
    const s = santriMap.get(a.santri_id);
    if (!santriAlphaMap.has(a.santri_id)) {
      santriAlphaMap.set(a.santri_id, {
        nama: s?.nama_lengkap || 'Santri',
        kamar: s?.kamar || '-',
        alpha: 0,
        izin: 0,
        sakit: 0,
      });
    }
    const entry = santriAlphaMap.get(a.santri_id)!;
    if (a.status === 'alpha') entry.alpha += 1;
    else if (a.status === 'izin') entry.izin += 1;
    else if (a.status === 'sakit') entry.sakit += 1;
  }

  const topAlphaSantri = Array.from(santriAlphaMap.values())
    .filter((x) => x.alpha > 0)
    .sort((a, b) => b.alpha - a.alpha)
    .slice(0, 15);

  return {
    persenHadir: computeDelta(cStat.pct, pStat.pct),
    totalRecord: cStat.total,
    hadirCount: cStat.hadir,
    alphaCount: computeDelta(cStat.alpha, pStat.alpha),
    izinCount: cStat.izin,
    sakitCount: cStat.sakit,
    perWaktu,
    topAlphaSantri,
  };
}

export function buildKesehatanReport(
  sakitList: SantriSakitRaw[],
  obatList: ObatRaw[],
  penyuluhanList: PenyuluhanRaw[],
  santriMap: Map<string, SantriRaw>,
  window: PeriodWindow
): KesehatanReport {
  const curr = sakitList.filter((s) => inRange(s.tgl_sakit, window.startDate, window.endDate));
  const prev = sakitList.filter((s) => inRange(s.tgl_sakit, window.prevStartDate, window.prevEndDate));
  const currPeny = penyuluhanList.filter((p) =>
    inRange(p.tanggal, window.startDate, window.endDate)
  );

  const obatMenipisRows = obatList.filter((o) => Number(o.stok || 0) <= Number(o.stok_minimum || 0));

  return {
    totalSakit: computeDelta(curr.length, prev.length),
    dirawatUks: curr.filter((s) => s.status === 'rawat_uks').length,
    dirujukCount: curr.filter((s) => s.status === 'dirujuk').length,
    sembuhCount: curr.filter((s) => s.status === 'sembuh').length,
    obatMenipisCount: obatMenipisRows.length,
    penyuluhanCount: currPeny.length,
    pasienRows: curr
      .sort((a, b) => (b.tgl_sakit || '').localeCompare(a.tgl_sakit || ''))
      .map((item, idx) => {
        const s = santriMap.get(item.santri_id);
        let tindakan = item.tindakan || '-';
        if (tindakan.startsWith('[KESEHATAN_META:')) {
          const endIdx = tindakan.indexOf(']');
          if (endIdx !== -1) tindakan = tindakan.slice(endIdx + 1).trim() || '-';
        }
        return {
          no: idx + 1,
          tglSakit: formatTanggalPendek(item.tgl_sakit),
          nama: s?.nama_lengkap || 'Santri',
          kamar: s?.kamar || '-',
          keluhan: item.keluhan || '-',
          tindakan,
          statusLabel:
            item.status === 'sembuh'
              ? 'Sembuh'
              : item.status === 'dirujuk'
              ? 'Dirujuk'
              : 'Rawat UKS',
        };
      }),
    obatMenipisRows,
    penyuluhanRows: currPeny,
  };
}

export function buildDapurReport(
  sesiList: DapurSesiMasak[],
  absenList: DapurAbsenPetugas[],
  kasList: DapurKasItem[],
  window: PeriodWindow
): DapurReport {
  const currSesi = sesiList.filter((s) => inRange(s.tanggal, window.startDate, window.endDate));
  const prevSesi = sesiList.filter((s) =>
    inRange(s.tanggal, window.prevStartDate, window.prevEndDate)
  );

  const selesaiCurr = currSesi.filter(
    (s) => s.status_waktu === 'tepat_waktu' || s.status_waktu === 'terlambat'
  );
  const selesaiPrev = prevSesi.filter(
    (s) => s.status_waktu === 'tepat_waktu' || s.status_waktu === 'terlambat'
  );

  const tepatCurr = selesaiCurr.filter((s) => s.status_waktu === 'tepat_waktu').length;
  const tepatPrev = selesaiPrev.filter((s) => s.status_waktu === 'tepat_waktu').length;
  const pctTepatCurr = selesaiCurr.length > 0 ? Math.round((tepatCurr / selesaiCurr.length) * 100) : 0;
  const pctTepatPrev = selesaiPrev.length > 0 ? Math.round((tepatPrev / selesaiPrev.length) * 100) : 0;

  const currAbsen = absenList.filter((a) => inRange(a.tanggal, window.startDate, window.endDate));
  const prevAbsen = absenList.filter((a) =>
    inRange(a.tanggal, window.prevStartDate, window.prevEndDate)
  );
  const pctHadirCurr =
    currAbsen.length > 0
      ? Math.round((currAbsen.filter((a) => a.status === 'hadir').length / currAbsen.length) * 100)
      : 0;
  const pctHadirPrev =
    prevAbsen.length > 0
      ? Math.round((prevAbsen.filter((a) => a.status === 'hadir').length / prevAbsen.length) * 100)
      : 0;

  const currKas = kasList.filter((k) => inRange(k.tanggal, window.startDate, window.endDate));
  const prevKas = kasList.filter((k) => inRange(k.tanggal, window.prevStartDate, window.prevEndDate));
  const masukCurr = currKas
    .filter((k) => k.jenis === 'masuk')
    .reduce((s, k) => s + Number(k.nominal || 0), 0);
  const keluarCurr = currKas
    .filter((k) => k.jenis === 'keluar')
    .reduce((s, k) => s + Number(k.nominal || 0), 0);
  const keluarPrev = prevKas
    .filter((k) => k.jenis === 'keluar')
    .reduce((s, k) => s + Number(k.nominal || 0), 0);

  return {
    persenTepatWaktu: computeDelta(pctTepatCurr, pctTepatPrev),
    totalSesiSelesai: selesaiCurr.length,
    tepatWaktuCount: tepatCurr,
    terlambatCount: selesaiCurr.filter((s) => s.status_waktu === 'terlambat').length,
    persenHadirPetugas: computeDelta(pctHadirCurr, pctHadirPrev),
    kasMasuk: masukCurr,
    kasKeluar: computeDelta(keluarCurr, keluarPrev),
    kasSaldoPeriode: masukCurr - keluarCurr,
    sesiRows: [...currSesi].sort((a, b) => `${b.tanggal} ${b.shift}`.localeCompare(`${a.tanggal} ${a.shift}`)),
    kasRows: [...currKas].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '')),
  };
}

export function buildSarprasReport(
  inventarisList: SarprasInventarisItem[],
  laporanList: SarprasLaporanItem[],
  window: PeriodWindow
): SarprasReport {
  let totalAsetUnit = 0;
  let asetBaikUnit = 0;
  let asetRusakUnit = 0;
  const katMap = new Map<
    string,
    { kategori: string; totalUnit: number; baik: number; rusakRingan: number; rusakBerat: number }
  >();

  for (const inv of inventarisList) {
    const qty = Number(inv.jumlah || 0);
    totalAsetUnit += qty;
    if (inv.kondisi === 'baik') asetBaikUnit += qty;
    else asetRusakUnit += qty;

    const kat = inv.kategori || 'Lainnya';
    if (!katMap.has(kat)) {
      katMap.set(kat, { kategori: kat, totalUnit: 0, baik: 0, rusakRingan: 0, rusakBerat: 0 });
    }
    const rec = katMap.get(kat)!;
    rec.totalUnit += qty;
    if (inv.kondisi === 'baik') rec.baik += qty;
    else if (inv.kondisi === 'rusak_ringan') rec.rusakRingan += qty;
    else rec.rusakBerat += qty;
  }

  const currLap = laporanList.filter((l) =>
    inRange(l.tanggal_lapor, window.startDate, window.endDate)
  );
  const prevLap = laporanList.filter((l) =>
    inRange(l.tanggal_lapor, window.prevStartDate, window.prevEndDate)
  );

  const currSelesai = currLap.filter((l) => l.status === 'selesai').length;
  const prevSelesai = prevLap.filter((l) => l.status === 'selesai').length;

  const currBiaya = currLap.reduce((s, l) => s + Number(l.biaya_perbaikan || 0), 0);
  const prevBiaya = prevLap.reduce((s, l) => s + Number(l.biaya_perbaikan || 0), 0);

  return {
    totalAsetUnit,
    asetBaikUnit,
    asetRusakUnit,
    tiketMasuk: computeDelta(currLap.length, prevLap.length),
    tiketSelesai: computeDelta(currSelesai, prevSelesai),
    biayaPerbaikan: computeDelta(currBiaya, prevBiaya),
    tiketAktifTotal: laporanList.filter((l) => l.status !== 'selesai').length,
    laporanRows: [...currLap].sort((a, b) =>
      (b.tanggal_lapor || '').localeCompare(a.tanggal_lapor || '')
    ),
    inventarisKondisiSummary: Array.from(katMap.values()).sort((a, b) =>
      a.kategori.localeCompare(b.kategori, 'id')
    ),
  };
}

export function buildLaundryReport(
  catatanList: LaundryCatatanItem[],
  window: PeriodWindow
): LaundryReport {
  const curr = catatanList.filter((c) => inRange(c.tanggal, window.startDate, window.endDate));
  const prev = catatanList.filter((c) =>
    inRange(c.tanggal, window.prevStartDate, window.prevEndDate)
  );

  const currPotong = curr.reduce((s, c) => s + Number(c.jumlah_potong || 0), 0);
  const prevPotong = prev.reduce((s, c) => s + Number(c.jumlah_potong || 0), 0);

  const byDate = new Map<string, LaundryCatatanItem[]>();
  for (const row of curr) {
    if (!byDate.has(row.tanggal)) byDate.set(row.tanggal, []);
    byDate.get(row.tanggal)!.push(row);
  }

  const dailyRows = Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([tgl, items]) => ({
      tanggal: tgl,
      hariLabel: formatHariTanggalIndo(tgl),
      totalKamar: items.length,
      totalPotong: items.reduce((s, i) => s + Number(i.jumlah_potong || 0), 0),
      selesaiCount: items.filter((i) => i.status === 'selesai').length,
      kamarDetail: items
        .map((i) => `${i.kamar} (${i.jumlah_potong} pcs${i.status === 'selesai' ? ' · Selesai' : ''})`)
        .join(', '),
    }));

  return {
    totalSetoran: computeDelta(curr.length, prev.length),
    totalPotong: computeDelta(currPotong, prevPotong),
    selesaiCount: curr.filter((c) => c.status === 'selesai').length,
    masukCount: curr.filter((c) => c.status === 'masuk').length,
    susulanCount: curr.filter((c) => c.tipe_setoran === 'susulan').length,
    dailyRows,
    detailRows: [...curr].sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
  };
}

export function buildTrendPoints(
  raw: AllLaporanRawData,
  window: PeriodWindow
): TrendBucketPoint[] {
  const points: TrendBucketPoint[] = [];
  const count = 6;

  for (let i = count - 1; i >= 0; i--) {
    let bStart = '';
    let bEnd = '';
    let label = '';

    if (window.mode === 'bulanan') {
      const [yStr, mStr] = window.startDate.split('-');
      let y = parseInt(yStr || '2026', 10);
      let m = parseInt(mStr || '1', 10) - i;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      bStart = `${ym}-01`;
      bEnd = getMonthLastDayIso(ym);
      label = `${NAMA_BULAN_ID[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
    } else {
      const span = window.mode === 'mingguan' ? 7 : window.dayCount;
      const offsetDays = i * span;
      bEnd = addDaysIso(window.endDate, -offsetDays);
      bStart = addDaysIso(bEnd, -(span - 1));
      label = i === 0 ? 'Periode Ini' : `-${i} Prd (${bStart.slice(8)}/${bStart.slice(5, 7)})`;
    }

    const txMasuk = raw.transaksi
      .filter((t) => t.tipe === 'masuk' && inRange(t.tgl_transaksi, bStart, bEnd))
      .reduce((s, t) => s + Number(t.nominal || 0), 0);

    const izinPulang = raw.izinPulang.filter((z) => inRange(z.tgl_pulang, bStart, bEnd)).length;
    const pelanggaran = raw.pelanggaran.filter((p) => inRange(p.tanggal, bStart, bEnd)).length;

    const abs = raw.absenJamaah.filter((a) => inRange(a.tgl, bStart, bEnd));
    const hadir = abs.filter((a) => a.status === 'hadir').length;
    const jamaahPersen = abs.length > 0 ? Math.round((hadir / abs.length) * 100) : 0;

    const santriSakit = raw.santriSakit.filter((s) => inRange(s.tgl_sakit, bStart, bEnd)).length;
    const laundryPotong = raw.laundryCatatan
      .filter((l) => inRange(l.tanggal, bStart, bEnd))
      .reduce((s, l) => s + Number(l.jumlah_potong || 0), 0);

    points.push({
      label,
      startDate: bStart,
      endDate: bEnd,
      keuanganMasukJuta: Number((txMasuk / 1_000_000).toFixed(2)),
      izinPulang,
      pelanggaran,
      jamaahPersen,
      santriSakit,
      laundryPotong,
    });
  }

  return points;
}

export function buildAllDivisionReports(
  raw: AllLaporanRawData,
  window: PeriodWindow,
  todayStr: string,
  options?: { canViewBisyaroh?: boolean }
): LaporanBundle {
  const canViewBisyaroh = options?.canViewBisyaroh !== false;
  const santriMap = new Map<string, SantriRaw>(raw.santri.map((s) => [s.id, s]));

  const personalia = buildPersonaliaSummary(raw.pengurus);
  const administrasi = buildAdministrasiSummary(raw.santri, raw.pengurus, window);
  const keuangan = buildKeuanganReport(
    raw.transaksi,
    raw.pembayaranDetails,
    raw.masterPembayaran,
    raw.tarifRiwayat,
    raw.santri,
    raw.pengurus,
    raw.pengaturan,
    window,
    todayStr,
    { canViewBisyaroh }
  );
  const kegiatan = buildKegiatanReport(raw.kegiatanAgenda, window);
  const perizinan = buildPerizinanReport(raw.izinPulang, santriMap, window);
  const keamanan = buildKeamananReport(raw.pelanggaran, raw.sitaBarang, santriMap, window);
  const jamaah = buildJamaahReport(raw.absenJamaah, santriMap, window);
  const kesehatan = buildKesehatanReport(
    raw.santriSakit,
    raw.obatList,
    raw.penyuluhan,
    santriMap,
    window
  );
  const dapur = buildDapurReport(raw.dapurSesi, raw.dapurAbsen, raw.dapurKas, window);
  const sarpras = buildSarprasReport(raw.sarprasInventaris, raw.sarprasLaporan, window);
  const laundry = buildLaundryReport(raw.laundryCatatan, window);

  const trendPoints = buildTrendPoints(raw, window);

  return {
    window,
    pengaturan: raw.pengaturan,
    personalia,
    administrasi,
    keuangan,
    kegiatan,
    perizinan,
    keamanan,
    jamaah,
    kesehatan,
    dapur,
    sarpras,
    laundry,
    charts: {
      crossDivisionCounts: [
        {
          label: 'Izin Pulang',
          unit: 'izin',
          current: perizinan.totalIzin.current,
          previous: perizinan.totalIzin.previous,
        },
        {
          label: 'Pelanggaran',
          unit: 'kasus',
          current: keamanan.totalKasus.current,
          previous: keamanan.totalKasus.previous,
        },
        {
          label: 'Santri Sakit',
          unit: 'santri',
          current: kesehatan.totalSakit.current,
          previous: kesehatan.totalSakit.previous,
        },
        {
          label: 'Tiket Sarpras',
          unit: 'tiket',
          current: sarpras.tiketMasuk.current,
          previous: sarpras.tiketMasuk.previous,
        },
        {
          label: 'Agenda Kegiatan',
          unit: 'agenda',
          current: kegiatan.totalAgenda.current,
          previous: kegiatan.totalAgenda.previous,
        },
        {
          label: 'Kamar Laundry',
          unit: 'setor',
          current: laundry.totalSetoran.current,
          previous: laundry.totalSetoran.previous,
        },
      ],
      keuanganComparison: [
        {
          label: 'Total Pemasukan',
          unit: 'Rp',
          current: keuangan.masukTotal.current,
          previous: keuangan.masukTotal.previous,
        },
        {
          label: 'Masuk Tunai',
          unit: 'Rp',
          current: keuangan.masukTunai.current,
          previous: keuangan.masukTunai.previous,
        },
        {
          label: 'Masuk Transfer',
          unit: 'Rp',
          current: keuangan.masukTransfer.current,
          previous: keuangan.masukTransfer.previous,
        },
        {
          label: 'Total Pengeluaran',
          unit: 'Rp',
          current: keuangan.keluarTotal.current,
          previous: keuangan.keluarTotal.previous,
        },
      ],
      disiplinPersenComparison: [
        {
          label: 'Hadir Jamaah',
          unit: '%',
          current: jamaah.persenHadir.current,
          previous: jamaah.persenHadir.previous,
        },
        {
          label: 'Masak Tepat Waktu',
          unit: '%',
          current: dapur.persenTepatWaktu.current,
          previous: dapur.persenTepatWaktu.previous,
        },
        {
          label: 'Hadir Petugas Dapur',
          unit: '%',
          current: dapur.persenHadirPetugas.current,
          previous: dapur.persenHadirPetugas.previous,
        },
      ],
      trendPoints,
    },
  };
}

export async function fetchAllLaporanRawData(options?: {
  canViewBisyaroh?: boolean;
}): Promise<AllLaporanRawData> {
  const canViewBisyaroh = options?.canViewBisyaroh !== false;
  const [
    pengaturanRes,
    santriViewRes,
    santriFallbackRes,
    pengurusViewRes,
    pengurusFallbackRes,
    jabatanAllRes,
    transaksiRes,
    pembayaranRes,
    masterRes,
    riwayatRes,
    izinRes,
    pelanggaranRes,
    sitaRes,
    absenRes,
    sakitRes,
    obatFallback,
    penyuluhanFallback,
    dapurSesiRes,
    dapurAbsenRes,
    dapurKasRes,
    sarprasInv,
    sarprasLap,
    kegiatanAgenda,
    laundryCatatan,
    laundryJadwal,
  ] = await Promise.all([
    supabase.from('pengaturan_aplikasi').select('*').limit(1).maybeSingle(),
    supabase.from('v_santri_aman').select('*').order('nama_lengkap', { ascending: true }),
    supabase.from('santri').select('*').order('nama_lengkap', { ascending: true }),
    canViewBisyaroh
      ? supabase.from('v_pengurus_lengkap').select('*').order('nama_lengkap', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
    supabase.from('pengurus').select('*').order('nama_lengkap', { ascending: true }),
    supabase
      .from('pengurus_jabatan')
      .select('pengurus_id, divisi, nama_jabatan, is_utama, urutan_struktur')
      .order('urutan_struktur', { ascending: true }),
    supabase.from('keuangan_transaksi').select('*').order('tgl_transaksi', { ascending: true }),
    supabase.from('pembayaran_santri_detail').select('*'),
    supabase.from('master_pembayaran').select('*').order('urutan', { ascending: true }),
    supabase.from('master_pembayaran_riwayat').select('*'),
    supabase.from('izin_pulang').select('*').order('tgl_pulang', { ascending: false }),
    supabase.from('keamanan_pelanggaran').select('*').order('tanggal', { ascending: false }),
    supabase.from('keamanan_sita_barang').select('*').order('tgl_sita', { ascending: false }),
    supabase.from('absen_jamaah').select('*').order('tgl', { ascending: false }),
    supabase.from('santri_sakit').select('*').order('tgl_sakit', { ascending: false }),
    fetchTableWithFallback<ObatRaw>('poskestren_obat', 'siap_poskestren_obat_v1', {
      col: 'nama_obat',
      ascending: true,
    }),
    fetchTableWithFallback<PenyuluhanRaw>(
      'poskestren_penyuluhan',
      'siap_poskestren_penyuluhan_v1',
      { col: 'tanggal', ascending: false }
    ),
    fetchTableWithFallback<DapurSesiMasak>('dapur_sesi_masak', 'siap_dapur_sesi_v1', {
      col: 'tanggal',
      ascending: false,
    }),
    fetchTableWithFallback<DapurAbsenPetugas>('dapur_absen_petugas', 'siap_dapur_absen_v1', {
      col: 'tanggal',
      ascending: false,
    }),
    fetchTableWithFallback<DapurKasItem>('dapur_kas', 'siap_dapur_kas_v1', {
      col: 'tanggal',
      ascending: false,
    }),
    fetchSarprasInventaris(),
    fetchSarprasLaporan(),
    fetchKegiatanAgenda(),
    fetchLaundryCatatan(),
    fetchLaundryJadwal(),
  ]);

  const santriData =
    !santriViewRes.error && Array.isArray(santriViewRes.data)
      ? santriViewRes.data
      : santriFallbackRes.data;

  const rawPengurusRows =
    canViewBisyaroh &&
    !pengurusViewRes.error &&
    Array.isArray(pengurusViewRes.data) &&
    pengurusViewRes.data.length > 0
      ? (pengurusViewRes.data as PengurusRaw[])
      : Array.isArray(pengurusFallbackRes.data)
      ? (pengurusFallbackRes.data as PengurusRaw[])
      : [];

  const jabatanByPengurusId = new Map<
    string,
    Array<{ divisi?: string; nama_jabatan?: string; is_utama?: boolean }>
  >();
  if (!jabatanAllRes.error && Array.isArray(jabatanAllRes.data)) {
    for (const j of jabatanAllRes.data as Array<{
      pengurus_id: string;
      divisi?: string;
      nama_jabatan?: string;
      is_utama?: boolean;
    }>) {
      if (!jabatanByPengurusId.has(j.pengurus_id)) jabatanByPengurusId.set(j.pengurus_id, []);
      jabatanByPengurusId.get(j.pengurus_id)!.push({
        divisi: j.divisi,
        nama_jabatan: j.nama_jabatan,
        is_utama: j.is_utama,
      });
    }
  }

  const pengurusRows = rawPengurusRows.map((p) => ({
    ...p,
    nominal_bisyaroh: canViewBisyaroh ? p.nominal_bisyaroh : 0,
    jabatan_list:
      Array.isArray(p.jabatan_list) && p.jabatan_list.length > 0
        ? p.jabatan_list
        : jabatanByPengurusId.get(p.id) || [],
  }));

  const rawPengaturan: PengaturanAplikasiRaw = (pengaturanRes.data as PengaturanAplikasiRaw) || {
    nama_pesantren: 'Pondok Pesantren An-Nur 1 Bululawang',
    alamat_lengkap: 'Jl. Diponegoro IV / 2-6 Bululawang, Kab. Malang, Jawa Timur',
    no_telepon: '(0341) 805610',
    nama_pengasuh: 'Dr. KH. A. Fahrur Rozi',
    nama_kepala_pondok: 'Ust. M. Fajar Wahyudi',
    nama_sekretaris: 'Ust. Moh. Sayid Ali',
    nama_bendahara: 'Ust. Ali Nur Ikasan',
    jatuh_tempo_tanggal: 10,
  };

  if (!rawPengaturan.kop_surat_url && typeof window !== 'undefined') {
    try {
      const localExtRaw = window.localStorage.getItem('siap_pengaturan_extended_v1');
      if (localExtRaw) {
        const parsed = JSON.parse(localExtRaw) as { kop_surat_url?: string };
        if (parsed.kop_surat_url) rawPengaturan.kop_surat_url = parsed.kop_surat_url;
      }
    } catch {
      // ignore
    }
  }

  const rawTransaksi = Array.isArray(transaksiRes.data)
    ? (transaksiRes.data as KeuanganTransaksiRaw[])
    : [];

  return {
    pengaturan: rawPengaturan,
    santri: Array.isArray(santriData) ? (santriData as SantriRaw[]) : [],
    pengurus: pengurusRows,
    transaksi: canViewBisyaroh ? rawTransaksi : rawTransaksi.filter((tx) => !isBisyarohTx(tx)),
    pembayaranDetails: Array.isArray(pembayaranRes.data)
      ? (pembayaranRes.data as PembayaranDetailRaw[])
      : [],
    masterPembayaran: Array.isArray(masterRes.data)
      ? (masterRes.data as MasterPembayaranRaw[])
      : [],
    tarifRiwayat: Array.isArray(riwayatRes.data) ? (riwayatRes.data as TarifRiwayatRaw[]) : [],
    izinPulang: Array.isArray(izinRes.data) ? (izinRes.data as IzinPulangRaw[]) : [],
    pelanggaran: Array.isArray(pelanggaranRes.data) ? (pelanggaranRes.data as PelanggaranRaw[]) : [],
    sitaBarang: Array.isArray(sitaRes.data) ? (sitaRes.data as SitaBarangRaw[]) : [],
    absenJamaah: Array.isArray(absenRes.data) ? (absenRes.data as AbsenJamaahRaw[]) : [],
    santriSakit: Array.isArray(sakitRes.data) ? (sakitRes.data as SantriSakitRaw[]) : [],
    obatList: obatFallback.rows || [],
    penyuluhan: penyuluhanFallback.rows || [],
    dapurSesi: dapurSesiRes.rows || [],
    dapurAbsen: dapurAbsenRes.rows || [],
    dapurKas: dapurKasRes.rows || [],
    sarprasInventaris: sarprasInv.rows || [],
    sarprasLaporan: sarprasLap.rows || [],
    kegiatanAgenda: kegiatanAgenda || [],
    laundryCatatan: laundryCatatan || [],
    laundryJadwal: laundryJadwal || [],
  };
}

function appendSheetAoa(wb: XLSX.WorkBook, sheetName: string, rows: unknown[][]): void {
  const safeName = sheetName.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet';
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, safeName);
}

export function exportLaporanToExcel(
  bundle: LaporanBundle,
  scope: LaporanScope,
  selectedDivisions: LaporanDivisionKey[]
): void {
  const wb = XLSX.utils.book_new();
  const includeDiv = (div: LaporanDivisionKey) =>
    scope === div || (scope === 'gabungan' && selectedDivisions.includes(div));

  const titleHeader = [
    [bundle.pengaturan.nama_pesantren || 'Pondok Pesantren An-Nur 1 Bululawang'],
    [`PUSAT LAPORAN - ${scope === 'gabungan' ? 'LAPORAN GABUNGAN DIVISI' : scope.toUpperCase()}`],
    [`Periode: ${bundle.window.label} (${bundle.window.comparisonLabel})`],
    [],
  ];

  // Sheet Ringkasan (untuk gabungan atau per divisi)
  if (scope === 'gabungan') {
    const summaryRows: unknown[][] = [
      ...titleHeader,
      ['DIVISI / INDIKATOR', 'PERIODE INI', 'PERIODE LALU', 'SELISIH'],
      ['Santri Aktif (Non-Ndalem)', bundle.administrasi.totalSantriAktif, '-', '-'],
      ['Santri Ndalem', bundle.administrasi.totalSantriNdalem, '-', '-'],
      ['Pengurus Aktif', bundle.administrasi.totalPengurusAktif, '-', '-'],
      [
        'Pemasukan Keuangan (Rp)',
        bundle.keuangan.masukTotal.current,
        bundle.keuangan.masukTotal.previous,
        bundle.keuangan.masukTotal.diff,
      ],
      [
        'Pengeluaran Keuangan (Rp)',
        bundle.keuangan.keluarTotal.current,
        bundle.keuangan.keluarTotal.previous,
        bundle.keuangan.keluarTotal.diff,
      ],
      ['Total Tunggakan Syahriah (Rp)', bundle.keuangan.totalTunggakanNominal, '-', '-'],
      [
        'Agenda Kegiatan',
        bundle.kegiatan.totalAgenda.current,
        bundle.kegiatan.totalAgenda.previous,
        bundle.kegiatan.totalAgenda.diff,
      ],
      [
        'Izin Pulang Santri',
        bundle.perizinan.totalIzin.current,
        bundle.perizinan.totalIzin.previous,
        bundle.perizinan.totalIzin.diff,
      ],
      [
        'Kasus Pelanggaran',
        bundle.keamanan.totalKasus.current,
        bundle.keamanan.totalKasus.previous,
        bundle.keamanan.totalKasus.diff,
      ],
      [
        'Kehadiran Sholat Jamaah (%)',
        bundle.jamaah.persenHadir.current,
        bundle.jamaah.persenHadir.previous,
        bundle.jamaah.persenHadir.diff,
      ],
      [
        'Santri Sakit (Poskestren)',
        bundle.kesehatan.totalSakit.current,
        bundle.kesehatan.totalSakit.previous,
        bundle.kesehatan.totalSakit.diff,
      ],
      [
        'Masak Dapur Tepat Waktu (%)',
        bundle.dapur.persenTepatWaktu.current,
        bundle.dapur.persenTepatWaktu.previous,
        bundle.dapur.persenTepatWaktu.diff,
      ],
      [
        'Tiket Kerusakan Sarpras',
        bundle.sarpras.tiketMasuk.current,
        bundle.sarpras.tiketMasuk.previous,
        bundle.sarpras.tiketMasuk.diff,
      ],
      [
        'Setoran Laundry (Potong / Pcs)',
        bundle.laundry.totalPotong.current,
        bundle.laundry.totalPotong.previous,
        bundle.laundry.totalPotong.diff,
      ],
    ];
    appendSheetAoa(wb, 'Ringkasan Utama', summaryRows);
  }

  if (includeDiv('administrasi')) {
    const rows: unknown[][] = [
      ...titleHeader,
      ['DATA SANTRI REAL PER KAMAR'],
      ['No', 'Kamar', 'Jumlah Santri'],
      ...bundle.administrasi.kamarCounts.map((k, idx) => [idx + 1, k.kamar, k.jumlah]),
      [],
      ['Ringkasan', 'Jumlah'],
      ['Santri Aktif', bundle.administrasi.totalSantriAktif],
      ['Santri Ndalem', bundle.administrasi.totalSantriNdalem],
      ['Pengurus Aktif', bundle.administrasi.totalPengurusAktif],
      ['Total Keseluruhan', bundle.administrasi.totalKeseluruhan],
    ];
    appendSheetAoa(wb, 'Administrasi Santri', rows);
  }

  if (includeDiv('keuangan')) {
    const kasRows: unknown[][] = [
      ...titleHeader,
      ['POSISI SALDO 4 DOMPET TUNAI & PEMASUKAN TRANSFER'],
      ['1. Dompet Pendaftaran (Tunai)', bundle.keuangan.saldoDompetSaatIni.pendaftaran],
      ['2. Dompet Syahriyah & Operasional (Tunai)', bundle.keuangan.saldoDompetSaatIni.operasional],
      ['3. Dompet Kas Umum (Tunai)', bundle.keuangan.saldoDompetSaatIni.kas_pondok],
      ['4. Dompet MDA / Madin (Tunai)', bundle.keuangan.saldoDompetSaatIni.mda],
      ['Total 4 Dompet Tunai', bundle.keuangan.saldoDompetSaatIni.total],
      ['Pemasukan Transfer (Laporan Bank Terpisah)', bundle.keuangan.syahriyahTransfer.netAllTime],
      [],
      ['BUKU KAS TUNAI & MUTASI PERIODE INI'],
      ['Kelompok', 'Tanggal', 'Uraian / Nama', 'Bulan', 'Debit (Rp)', 'Kredit (Rp)', 'Keterangan', 'Saldo (Rp)'],
    ];
    for (const wk of bundle.keuangan.weeklyBuckets) {
      kasRows.push([wk.label, wk.rentang, 'Saldo Awal', '', wk.tunaiSaldoAwal, 0, '', wk.tunaiSaldoAwal]);
      for (const r of wk.tunaiRows) {
        kasRows.push([wk.label, r.tanggal, r.uraian, r.bulan, r.debit, r.kredit, r.keterangan, r.saldo]);
      }
      kasRows.push([wk.label, '', 'Saldo Akhir Pekan', '', wk.tunaiDebit, wk.tunaiKredit, '', wk.tunaiSaldoAkhir]);
    }
    appendSheetAoa(wb, 'Keuangan Kas Tunai', kasRows);

    const tfRows: unknown[][] = [
      ...titleHeader,
      ['PEMASUKAN TRANSFER (LAPORAN REKENING BANK)'],
      ['Kelompok', 'Tanggal', 'Nama / Uraian', 'Nominal (Rp)', 'Keterangan', 'Bukti'],
    ];
    for (const wk of bundle.keuangan.weeklyBuckets) {
      for (const r of wk.transferRows) {
        tfRows.push([wk.label, r.tanggal, r.nama, r.nominal, r.keterangan, r.bukti]);
      }
    }
    appendSheetAoa(wb, 'Pemasukan Transfer', tfRows);

    const tunggakanRows: unknown[][] = [
      ...titleHeader,
      ['RINCIAN TUNGGAKAN SANTRI'],
      ['Kategori', 'Nama Santri', 'Kamar', 'Bulan Tunggakan', 'Jml Bulan', 'SPP (Rp)', 'Total (Rp)'],
      ...bundle.keuangan.tunggakan1Bulan.map((t) => [
        '1 Bulan',
        t.nama,
        t.kamar,
        t.rentangBulan,
        t.jumlahBulan,
        t.tarifSpp,
        t.totalSemua,
      ]),
      ...bundle.keuangan.tunggakan2Bulan.map((t) => [
        '2 Bulan',
        t.nama,
        t.kamar,
        t.rentangBulan,
        t.jumlahBulan,
        t.tarifSpp,
        t.totalSemua,
      ]),
      ...bundle.keuangan.tunggakanLebih2Bulan.map((t) => [
        '> 2 Bulan',
        t.nama,
        t.kamar,
        t.rentangBulan,
        t.jumlahBulan,
        t.tarifSpp,
        t.totalSemua,
      ]),
    ];
    appendSheetAoa(wb, 'Tunggakan Santri', tunggakanRows);

    if (bundle.keuangan.bisyarohList.length > 0) {
      const bisRows: unknown[][] = [
        ...titleHeader,
        ['ANGGARAN BISYAROH PENGURUS'],
        ['No', 'Struktur / Jabatan', 'Nama', 'Nominal (Rp)'],
        ...bundle.keuangan.bisyarohList.map((b) => [b.no, b.struktur, b.nama, b.jumlah]),
        ['', '', 'TOTAL', bundle.keuangan.totalBisyaroh],
      ];
      appendSheetAoa(wb, 'Bisyaroh Pengurus', bisRows);
    }
  }

  if (includeDiv('kegiatan')) {
    const rows: unknown[][] = [
      ...titleHeader,
      ['DAFTAR KEGIATAN PONDOK'],
      ['No', 'Tanggal', 'Judul', 'Kategori', 'Waktu', 'Lokasi', 'PJ', 'Pengisi Terisi', 'Status'],
      ...bundle.kegiatan.agendaList.map((a, idx) => [
        idx + 1,
        a.tanggal,
        a.judul,
        a.kategori === 'event_besar' ? 'Event Besar' : 'Rutin',
        `${a.jam_mulai}${a.jam_selesai ? ` - ${a.jam_selesai}` : ''}`,
        a.lokasi,
        a.penanggung_jawab,
        `${a.pengisiProgress.terisi}/${a.pengisiProgress.total}`,
        a.status,
      ]),
    ];
    appendSheetAoa(wb, 'Kegiatan', rows);
  }

  if (includeDiv('perizinan')) {
    const rows: unknown[][] = [
      ...titleHeader,
      ['LAPORAN PERIZINAN PULANG'],
      ['No', 'Nama', 'Kamar', 'Alamat', 'Jenis', 'Tgl Pulang', 'Rencana Kembali', 'Aktual Kembali', 'Keperluan', 'Status'],
      ...bundle.perizinan.rows.map((r) => [
        r.no,
        r.nama,
        r.kamar,
        r.alamat,
        r.jenis,
        r.tglPulang,
        r.tglRencana,
        r.tglAktual,
        r.keperluan,
        r.statusLabel,
      ]),
    ];
    appendSheetAoa(wb, 'Perizinan Pulang', rows);
  }

  if (includeDiv('keamanan')) {
    const rows: unknown[][] = [
      ...titleHeader,
      ['LAPORAN PELANGGARAN & KETERTIBAN'],
      ['No', 'Tanggal', 'Nama', 'Kamar', 'Pelanggaran', 'Tingkat', 'Poin', 'Takzir', 'Status'],
      ...bundle.keamanan.pelanggaranRows.map((r) => [
        r.no,
        r.tanggal,
        r.nama,
        r.kamar,
        r.pelanggaran,
        r.tingkat,
        r.poin,
        r.takzir,
        r.statusTakzir,
      ]),
    ];
    appendSheetAoa(wb, 'Keamanan Pelanggaran', rows);
  }

  if (includeDiv('jamaah')) {
    const rows: unknown[][] = [
      ...titleHeader,
      ['REKAP SHOLAT JAMAAH PER WAKTU'],
      ['Waktu Sholat', 'Hadir', 'Alpha', 'Izin', 'Sakit', '% Hadir'],
      ...bundle.jamaah.perWaktu.map((w) => [
        w.waktu,
        w.hadir,
        w.alpha,
        w.izin,
        w.sakit,
        `${w.persenHadir}%`,
      ]),
      [],
      ['SANTRI ALPHA TERBANYAK PERIODE INI'],
      ['Nama', 'Kamar', 'Alpha', 'Izin', 'Sakit'],
      ...bundle.jamaah.topAlphaSantri.map((s) => [s.nama, s.kamar, s.alpha, s.izin, s.sakit]),
    ];
    appendSheetAoa(wb, 'Absen Jamaah', rows);
  }

  if (includeDiv('kesehatan')) {
    const rows: unknown[][] = [
      ...titleHeader,
      ['LAPORAN KESEHATAN / POSKESTREN'],
      ['No', 'Tgl Sakit', 'Nama Santri', 'Kamar', 'Keluhan', 'Tindakan', 'Status'],
      ...bundle.kesehatan.pasienRows.map((p) => [
        p.no,
        p.tglSakit,
        p.nama,
        p.kamar,
        p.keluhan,
        p.tindakan,
        p.statusLabel,
      ]),
    ];
    appendSheetAoa(wb, 'Poskestren', rows);
  }

  if (includeDiv('dapur')) {
    const rows: unknown[][] = [
      ...titleHeader,
      ['LAPORAN SESI MASAK DAPUR'],
      ['Tanggal', 'Shift', 'Target', 'Status Waktu', 'Menu Ringkas', 'PJ'],
      ...bundle.dapur.sesiRows.map((s) => [
        s.tanggal,
        s.shift,
        s.target_selesai,
        s.status_waktu,
        s.menu_ringkas,
        s.petugas_pj,
      ]),
      [],
      ['KAS DAPUR PERIODE INI'],
      ['Tanggal', 'Jenis', 'Kategori', 'Uraian', 'Nominal (Rp)', 'PJ'],
      ...bundle.dapur.kasRows.map((k) => [
        k.tanggal,
        k.jenis,
        k.kategori,
        k.uraian,
        k.nominal,
        k.penanggung_jawab,
      ]),
    ];
    appendSheetAoa(wb, 'Dapur & Konsumsi', rows);
  }

  if (includeDiv('sarpras')) {
    const rows: unknown[][] = [
      ...titleHeader,
      ['REKAP KONDISI INVENTARIS'],
      ['Kategori', 'Total Unit', 'Baik', 'Rusak Ringan', 'Rusak Berat'],
      ...bundle.sarpras.inventarisKondisiSummary.map((k) => [
        k.kategori,
        k.totalUnit,
        k.baik,
        k.rusakRingan,
        k.rusakBerat,
      ]),
      [],
      ['LAPORAN KERUSAKAN & PERBAIKAN'],
      ['Kode Tiket', 'Tanggal', 'Ruangan', 'Kerusakan', 'Urgensi', 'Status', 'Biaya (Rp)'],
      ...bundle.sarpras.laporanRows.map((l) => [
        l.kode_tiket,
        l.tanggal_lapor,
        l.ruangan,
        l.judul_kerusakan,
        l.urgensi,
        l.status,
        l.biaya_perbaikan,
      ]),
    ];
    appendSheetAoa(wb, 'Sarpras', rows);
  }

  if (includeDiv('laundry')) {
    const rows: unknown[][] = [
      ...titleHeader,
      ['REKAP HARIAN SIE LAUNDRY'],
      ['Tanggal', 'Hari', 'Kamar Setor', 'Total Potong (Pcs)', 'Selesai', 'Rincian Kamar'],
      ...bundle.laundry.dailyRows.map((d) => [
        d.tanggal,
        d.hariLabel,
        d.totalKamar,
        d.totalPotong,
        d.selesaiCount,
        d.kamarDetail,
      ]),
    ];
    appendSheetAoa(wb, 'Sie Laundry', rows);
  }

  const fileSlug = `${scope}-${bundle.window.startDate}_${bundle.window.endDate}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Laporan_AnNur1_${fileSlug}.xlsx`);
}
