'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Wallet,
  HeartPulse,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  PlusCircle,
  CheckCircle2,
  CalendarCheck,
  RefreshCw,
  DoorOpen,
  ShieldAlert,
  Utensils,
  Package,
  Camera,
  Calendar,
  Shirt,
  CalendarDays,
  SlidersHorizontal,
  FileSpreadsheet,
  MapPin,
  MessageCircle,
  Receipt,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import SarprasQuickReportModal from '@/components/SarprasQuickReportModal';
import QuickMenuConfigModal, { renderQuickMenuIcon } from '@/components/QuickMenuConfigModal';
import {
  type DapurSesiMasak,
  type DapurMenuJadwal,
  type DapurKasItem,
  LS_DAPUR_SESI_KEY,
  LS_DAPUR_MENU_KEY,
  LS_DAPUR_KAS_KEY,
  computeCookingTimelinessStats,
  fetchTableWithFallback,
  formatTimeClock,
} from '@/lib/dapur';
import {
  type SarprasInventarisItem,
  type SarprasLaporanItem,
  fetchSarprasInventaris,
  fetchSarprasLaporan,
} from '@/lib/sarpras';
import {
  type KegiatanAgendaItem,
  addDaysIso,
  countPengisiProgress,
  fetchKegiatanAgenda,
  formatHariTanggalIndo,
} from '@/lib/kegiatan';
import {
  type LaundryCatatanItem,
  HARI_LABEL_MAP,
  fetchLaundryCatatan,
  fetchLaundryJadwal,
  getHariKeyFromIso,
  isHariLiburLaundry,
} from '@/lib/laundry';
import {
  DEFAULT_MENU_CEPAT_IDS,
  DEFAULT_MOBILE_NAV_HREFS,
  QUICK_MENU_CATALOG,
  type QuickMenuCatalogItem,
  type MasterPembayaranItem,
  type TarifRiwayatItem,
  getDynamicTahunAjaranAktif,
  getTarifAktifFromRiwayat,
  isMissingColumnError,
  mergeAturanOperasional,
  normalizeMenuCepatIds,
  readExtendedLocal,
  readMobileNavPrefs,
  writeExtendedLocal,
  writeMobileNavPrefs,
} from '@/lib/pengaturan';
import {
  computeJadwalSholatBululawang,
  formatHariPasaranIndo,
  getHijriDate,
  getNextPrayerCountdown,
  getWibTodayIso,
} from '@/lib/kalender';
import { computeWalletAndTransferSummary } from '@/lib/keuangan';
import { toWaMeDigits } from '@/lib/psb';
import { useAuth } from '@/lib/auth';

interface SantriRow {
  id: string;
  nama_lengkap?: string;
  nis?: string;
  status: string;
  kamar?: string;
  tgl_masuk?: string | null;
  tarif_syahriyah?: number;
  ktl_nominal?: number;
  no_wa_ayah?: string;
  no_wa_ibu?: string;
  no_wa_wali?: string;
}

interface PengurusRow {
  id: string;
  nama_lengkap?: string;
  jabatan?: string | null;
  divisi?: string | null;
  status?: string | null;
  masa_khidmat?: string | null;
}

interface PengurusJabatanRow {
  pengurus_id?: string | null;
  divisi?: string | null;
  nama_jabatan?: string | null;
}

interface TransaksiRow {
  id: string;
  dompet: 'pendaftaran' | 'operasional' | 'kas_pondok' | 'mda';
  tipe: 'masuk' | 'keluar';
  nominal: number;
  tgl_transaksi?: string;
  metode_pembayaran?: string | null;
  kategori?: string | null;
  keterangan?: string | null;
}

interface PengaturanRow {
  id?: number;
  nama_pesantren?: string;
  kota_surat?: string;
  jatuh_tempo_tanggal?: number;
  koreksi_hijriyah?: number | null;
  rekening_bank?: string;
  rekening_nomor?: string;
  rekening_atas_nama?: string;
  kop_surat_url?: string;
  saldo_awal_pendaftaran?: number;
  saldo_awal_operasional?: number;
  saldo_awal_kas_pondok?: number;
  saldo_awal_mda?: number;
  aturan_operasional?: unknown;
}

interface AbsenRow {
  id: string;
  tgl: string;
  santri_id?: string;
  waktu_sholat: 'subuh' | 'dzuhur' | 'ashar' | 'maghrib' | 'isya';
  status: 'hadir' | 'sakit' | 'izin' | 'alpha';
}

interface IzinPulangRow {
  id: string;
  santri_id: string;
  jenis_izin: string;
  tgl_pulang: string;
  tgl_rencana_kembali: string;
  alasan?: string | null;
  status: 'disetujui' | 'kembali' | 'terlambat';
}

interface IzinPulangPrioritas {
  id: string;
  santriNama: string;
  kamar: string;
  jenisIzin: string;
  tglRencanaKembali: string;
  batasJam: string;
  isLate: boolean;
  waDigits: string;
}

interface TunggakanSantriPrioritas {
  santriId: string;
  nama: string;
  kamar: string;
  jumlahBulan: number;
  ktlNominal: number;
  totalTagihan: number;
  jalur: 'WA_1_2' | 'SURAT_3_PLUS';
}

interface SantriSakitRow {
  id: string;
  santri_id: string;
  tgl_sakit: string;
  tgl_sembuh?: string | null;
  status: 'rawat_uks' | 'dirujuk' | 'sembuh';
}

interface KeamananPelanggaranRow {
  id: string;
  santri_id: string;
  tanggal: string;
  poin: number;
  status_takzir: 'belum_selesai' | 'selesai';
}

interface KeamananSitaRow {
  id: string;
  status: 'disita' | 'dikembalikan' | 'dimusnahkan';
}

interface TopPoinSantri {
  santriId: string;
  nama: string;
  kamar: string;
  totalPoin: number;
  kasusCount: number;
}

const TONE_CLASSES: Record<
  QuickMenuCatalogItem['tone'],
  { bg: string; iconText: string; border: string }
> = {
  emerald: { bg: 'siap-soft-box', iconText: 'siap-text-accent', border: '' },
  blue: { bg: 'bg-sky-50', iconText: 'text-sky-700', border: 'border-sky-200' },
  amber: { bg: 'bg-amber-50', iconText: 'text-amber-700', border: 'border-amber-200' },
  rose: { bg: 'bg-rose-50', iconText: 'text-rose-700', border: 'border-rose-200' },
  indigo: { bg: 'bg-indigo-50', iconText: 'text-indigo-700', border: 'border-indigo-200' },
  teal: { bg: 'siap-soft-box', iconText: 'siap-text-accent', border: '' },
  violet: { bg: 'bg-purple-50', iconText: 'text-purple-700', border: 'border-purple-200' },
  slate: { bg: 'bg-slate-100', iconText: 'text-slate-700', border: 'border-slate-200' },
};

function parseIzinMeta(alasan?: string | null): { batasJam: string; waPenjemput: string } {
  const fallback = { batasJam: '17:00', waPenjemput: '' };
  if (!alasan) return fallback;
  const marker = '[IZIN_META:';
  const idx = alasan.indexOf(marker);
  if (idx === -1) return fallback;
  try {
    const raw = alasan.slice(idx + marker.length, alasan.lastIndexOf(']'));
    const parsed = JSON.parse(raw) as { b?: string; w?: string };
    return {
      batasJam: typeof parsed.b === 'string' && /^\d{2}:\d{2}$/.test(parsed.b) ? parsed.b : '17:00',
      waPenjemput: typeof parsed.w === 'string' ? parsed.w : '',
    };
  } catch {
    return fallback;
  }
}

function formatRupiah(nominal: number): string {
  const rounded = Math.round(Number(nominal) || 0);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${digits}`;
}

function getWibTimeHm(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hh = parts.find((p) => p.type === 'hour')?.value || '00';
  const mm = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hh === '24' ? '00' : hh}:${mm}`;
}

function getStartPeriodeDariTglMasuk(tglMasuk?: string | null): string | null {
  if (!tglMasuk) return null;
  const match = String(tglMasuk)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  let yr = Number(match[1]);
  let mo = Number(match[2]);
  const dy = Number(match[3]);
  if (!yr || mo < 1 || mo > 12 || dy < 1 || dy > 31) return null;
  if (dy >= 26) {
    mo += 1;
    if (mo > 12) {
      mo = 1;
      yr += 1;
    }
  }
  return `${yr}-${String(mo).padStart(2, '0')}`;
}

function calcDiffDaysIso(startIso?: string | null, endIso?: string | null): number {
  if (!startIso || !endIso) return 0;
  const sm = String(startIso)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  const em = String(endIso)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!sm || !em) return 0;
  const startUtc = Date.UTC(Number(sm[1]), Number(sm[2]) - 1, Number(sm[3]));
  const endUtc = Date.UTC(Number(em[1]), Number(em[2]) - 1, Number(em[3]));
  return Math.max(0, Math.floor((endUtc - startUtc) / 86400000));
}

function normalizeDivisiPengurus(divisi: string): string {
  const clean = String(divisi || '').trim();
  if (clean === 'Pimpinan & Harian') return 'Dewan Harian';
  if (clean === 'Pengasuh') return 'Pengasuh Pondok';
  return clean;
}

function isExcludedTopDivisiPengurus(label: string): boolean {
  const norm = normalizeDivisiPengurus(label).toLowerCase();
  if (!norm) return false;
  if (
    norm === 'pengasuh pondok' ||
    norm === 'pengasuh' ||
    norm.startsWith('dewan pengasuh') ||
    norm.includes('dzurriyah') ||
    norm === 'direktur pendidikan'
  ) {
    return true;
  }
  if (norm.includes('pengasuh') && !norm.includes('kepala pondok')) return true;
  return false;
}

function isExcludedTopPengurus(p: PengurusRow): boolean {
  const jab = String(p.jabatan || '').trim();
  const div = String(p.divisi || '').trim();
  return isExcludedTopDivisiPengurus(jab) || isExcludedTopDivisiPengurus(div);
}

const MONTH_NAME_TO_NUM: Record<string, string> = {
  januari: '01',
  jan: '01',
  februari: '02',
  feb: '02',
  maret: '03',
  mar: '03',
  april: '04',
  apr: '04',
  mei: '05',
  juni: '06',
  jun: '06',
  juli: '07',
  jul: '07',
  agustus: '08',
  agu: '08',
  ags: '08',
  september: '09',
  sep: '09',
  oktober: '10',
  okt: '10',
  november: '11',
  nov: '11',
  desember: '12',
  des: '12',
};

function extractPeriodeTokens(text: string): string[] {
  const found = new Set<string>();
  const isoMatches = text.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])\b/g);
  for (const m of isoMatches) {
    found.add(`${m[1]}-${m[2]}`);
  }
  const idMatches = text.toLowerCase().matchAll(
    /\b(januari|jan|februari|feb|maret|mar|april|apr|mei|juni|jun|juli|jul|agustus|agu|ags|september|sep|oktober|okt|november|nov|desember|des)\s+(20\d{2})\b/g
  );
  for (const m of idMatches) {
    const mm = MONTH_NAME_TO_NUM[m[1]];
    if (mm) found.add(`${m[2]}-${mm}`);
  }
  return Array.from(found);
}

export default function DashboardPage() {
  const { canViewBisyaroh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tahunAjaran, setTahunAjaran] = useState('');
  const [bulanLabel, setBulanLabel] = useState('Bulan Berjalan');
  const [nowClock, setNowClock] = useState<Date | null>(null);

  // Menu Cepat & Bottom Nav Customization
  const [menuCepatIds, setMenuCepatIds] = useState<string[]>(DEFAULT_MENU_CEPAT_IDS);
  const [mobileNavHrefs, setMobileNavHrefs] = useState<string[]>(DEFAULT_MOBILE_NAV_HREFS);
  const [koreksiHijriyah, setKoreksiHijriyah] = useState<number>(0);
  const [rawPengaturanDb, setRawPengaturanDb] = useState<PengaturanRow | null>(null);
  const [quickConfigOpen, setQuickConfigOpen] = useState(false);
  const [savingQuickConfig, setSavingQuickConfig] = useState(false);
  const [quickToast, setQuickToast] = useState<string | null>(null);

  const [stats, setStats] = useState({
    santriAktif: 0,
    santriNdalem: 0,
    santriBeasiswa: 0,
    pengurusAktif: 0,
    totalPersonel: 0,
    saldoOperasional: 0,
    saldoPendaftaran: 0,
    saldoKasPondok: 0,
    saldoMda: 0,
    masukBulanIni: 0,
    transferMasukBulanIni: 0,
    transferNetAllTime: 0,
    namaPesantren: 'Pondok Pesantren An-Nur 1 Bululawang',
  });

  const [jamaahToday, setJamaahToday] = useState({
    total: 0,
    hadir: 0,
    sakit: 0,
    izin: 0,
    alpha: 0,
    persenHadir: 0,
    subuhCount: 0,
    dzuhurCount: 0,
    asharCount: 0,
    maghribCount: 0,
    isyaCount: 0,
  });

  const [jamaahMonthly, setJamaahMonthly] = useState({
    total: 0,
    hadir: 0,
    sakit: 0,
    izin: 0,
    alpha: 0,
    persenHadir: 0,
    hariTercatat: 0,
  });

  const [izinStats, setIzinStats] = useState({
    sedangPulang: 0,
    terlambat: 0,
    tidakMenginap: 0,
    menginap: 0,
  });
  const [izinPrioritasList, setIzinPrioritasList] = useState<IzinPulangPrioritas[]>([]);
  const [tunggakanSummary, setTunggakanSummary] = useState<{
    totalSantri: number;
    waCount: number;
    suratCount: number;
    totalNominal: number;
    previewList: TunggakanSantriPrioritas[];
  }>({
    totalSantri: 0,
    waCount: 0,
    suratCount: 0,
    totalNominal: 0,
    previewList: [],
  });

  const [kesehatanStats, setKesehatanStats] = useState({
    dirawatUks: 0,
    dirujuk: 0,
    sembuhBulanIni: 0,
    totalAktif: 0,
    peringatan3Hari: 0,
  });

  const [keamananStats, setKeamananStats] = useState<{
    takzirBelumSelesai: number;
    kasusBulanIni: number;
    santriAmbangSp: number;
    barangDisita: number;
    topPoinList: TopPoinSantri[];
  }>({
    takzirBelumSelesai: 0,
    kasusBulanIni: 0,
    santriAmbangSp: 0,
    barangDisita: 0,
    topPoinList: [],
  });

  const [dapurStats, setDapurStats] = useState<{
    pagiLabel: string;
    pagiStatus: string;
    soreLabel: string;
    soreStatus: string;
    persenTepatWaktu: number | null;
    tepatWaktuCount: number;
    totalSelesai: number;
    saldoKas: number;
    menuPagi: string;
    menuSore: string;
  }>({
    pagiLabel: 'Belum Mulai',
    pagiStatus: 'belum_mulai',
    soreLabel: 'Belum Mulai',
    soreStatus: 'belum_mulai',
    persenTepatWaktu: null,
    tepatWaktuCount: 0,
    totalSelesai: 0,
    saldoKas: 0,
    menuPagi: 'Belum dijadwalkan',
    menuSore: 'Belum dijadwalkan',
  });

  const [sarprasInventaris, setSarprasInventaris] = useState<SarprasInventarisItem[]>([]);
  const [sarprasLaporan, setSarprasLaporan] = useState<SarprasLaporanItem[]>([]);
  const [showSarprasReportModal, setShowSarprasReportModal] = useState(false);
  const [sarprasToast, setSarprasToast] = useState<string | null>(null);
  const [sarprasStats, setSarprasStats] = useState<{
    menunggu: number;
    diproses: number;
    selesaiBulanIni: number;
    asetRusak: number;
    daruratAktif: number;
    recentActive: SarprasLaporanItem[];
  }>({
    menunggu: 0,
    diproses: 0,
    selesaiBulanIni: 0,
    asetRusak: 0,
    daruratAktif: 0,
    recentActive: [],
  });

  const [kegiatanStats, setKegiatanStats] = useState<{
    agendaAktif: number;
    pekanIni: number;
    eventBesarAktif: number;
    pengisiTerisi: number;
    pengisiTotal: number;
    upcomingList: KegiatanAgendaItem[];
    todayIso: string;
  }>({
    agendaAktif: 0,
    pekanIni: 0,
    eventBesarAktif: 0,
    pengisiTerisi: 0,
    pengisiTotal: 0,
    upcomingList: [],
    todayIso: '',
  });

  const [laundryStats, setLaundryStats] = useState<{
    hariLabel: string;
    isLibur: boolean;
    kamarTerjadwal: number;
    kamarSetor: number;
    totalPotong: number;
    selesaiCount: number;
    masukCount: number;
    todayRecords: LaundryCatatanItem[];
  }>({
    hariLabel: '-',
    isLibur: false,
    kamarTerjadwal: 0,
    kamarSetor: 0,
    totalPotong: 0,
    selesaiCount: 0,
    masukCount: 0,
    todayRecords: [],
  });

  const fetchDashboardData = async () => {
    const now = new Date();
    const todayIso = getWibTodayIso(now);
    const [yyyyNum, mmNum, ddNum] = todayIso.split('-').map(Number);
    const yyyy = yyyyNum || now.getFullYear();
    const mm = String(mmNum || now.getMonth() + 1).padStart(2, '0');
    const currentHm = getWibTimeHm(now);
    const monthPrefix = `${yyyy}-${mm}`;
    const lastDayOfMonth = new Date(yyyy, mmNum, 0).getDate();
    const monthStart = `${monthPrefix}-01`;
    const monthEnd = `${monthPrefix}-${String(lastDayOfMonth).padStart(2, '0')}`;
    const startYear = mmNum >= 7 ? yyyy : yyyy - 1;
    const wibAnchorDate = new Date(Date.UTC(yyyy, mmNum - 1, ddNum, 5, 0, 0));
    const activeTa = getDynamicTahunAjaranAktif(wibAnchorDate);

    // Hitung daftar bulan TA sampai jatuh tempo (tanggal > 10 untuk bulan berjalan)
    const nowDay = ddNum;
    let cutoffYear = yyyy;
    let cutoffMonth = nowDay > 10 ? mmNum : mmNum - 1;
    if (cutoffMonth === 0) {
      cutoffMonth = 12;
      cutoffYear -= 1;
    }
    const cutoffPeriode = `${cutoffYear}-${String(cutoffMonth).padStart(2, '0')}`;
    const taMonths: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const mIdx = ((6 + i) % 12) + 1;
      const yr = mIdx >= 7 ? startYear : startYear + 1;
      const p = `${yr}-${String(mIdx).padStart(2, '0')}`;
      if (p <= cutoffPeriode) taMonths.push(p);
    }

    const namaBulan = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];

    const [
      santriRes,
      pengurusRes,
      pengurusJabatanRes,
      transaksiRes,
      pengaturanRes,
      jamaahRes,
      izinRes,
      sakitRes,
      keamananRes,
      sitaRes,
      pembayaranRes,
      masterBayarRes,
      riwayatTarifRes,
      dapurSesiRes,
      dapurMenuRes,
      dapurKasRes,
      sarprasInvRes,
      sarprasLapRes,
      kegiatanListRes,
      laundryJadwalRes,
      laundryCatatanRes,
    ] = await Promise.all([
      supabase
        .from('santri')
        .select('id, nama_lengkap, nis, status, kamar, tgl_masuk, tarif_syahriyah, ktl_nominal, no_wa_ayah, no_wa_ibu, no_wa_wali'),
      supabase.from('pengurus').select('*'),
      supabase.from('pengurus_jabatan').select('pengurus_id, divisi, nama_jabatan'),
      supabase.from('keuangan_transaksi').select('id, dompet, tipe, nominal, tgl_transaksi, metode_pembayaran, kategori, keterangan'),
      supabase.from('pengaturan_aplikasi').select('*').limit(1).maybeSingle(),
      supabase
        .from('absen_jamaah')
        .select('id, tgl, santri_id, waktu_sholat, status')
        .gte('tgl', monthStart)
        .lte('tgl', monthEnd),
      supabase
        .from('izin_pulang')
        .select('id, santri_id, jenis_izin, tgl_pulang, tgl_rencana_kembali, alasan, status')
        .in('status', ['disetujui', 'terlambat']),
      supabase.from('santri_sakit').select('id, santri_id, tgl_sakit, tgl_sembuh, status'),
      supabase.from('keamanan_pelanggaran').select('id, santri_id, tanggal, poin, status_takzir'),
      supabase.from('keamanan_sita_barang').select('id, status'),
      taMonths.length > 0
        ? supabase
            .from('pembayaran_santri_detail')
            .select('santri_id, tahun_ajaran, item_kode, periode_bulan')
            .in('periode_bulan', taMonths)
        : supabase
            .from('pembayaran_santri_detail')
            .select('santri_id, tahun_ajaran, item_kode, periode_bulan')
            .eq('tahun_ajaran', activeTa),
      supabase.from('master_pembayaran').select('id, kode, nama_item, tipe_periode, aktif'),
      supabase.from('master_pembayaran_riwayat').select('id, item_id, nominal, berlaku_mulai'),
      fetchTableWithFallback<DapurSesiMasak>('dapur_sesi_masak', LS_DAPUR_SESI_KEY),
      fetchTableWithFallback<DapurMenuJadwal>('dapur_menu_jadwal', LS_DAPUR_MENU_KEY),
      fetchTableWithFallback<DapurKasItem>('dapur_kas', LS_DAPUR_KAS_KEY),
      fetchSarprasInventaris(),
      fetchSarprasLaporan(),
      fetchKegiatanAgenda(),
      fetchLaundryJadwal(),
      fetchLaundryCatatan(),
    ]);

    if (santriRes.error) throw santriRes.error;
    if (transaksiRes.error) throw transaksiRes.error;

    const santriList = (santriRes.data || []) as SantriRow[];
    const pengurusList = (pengurusRes.error ? [] : pengurusRes.data || []) as PengurusRow[];
    const jabatanRows = (pengurusJabatanRes.error ? [] : pengurusJabatanRes.data || []) as PengurusJabatanRow[];
    const jabatanMap = new Map<string, PengurusJabatanRow[]>();
    for (const j of jabatanRows) {
      if (!j.pengurus_id) continue;
      const list = jabatanMap.get(j.pengurus_id) || [];
      list.push(j);
      jabatanMap.set(j.pengurus_id, list);
    }

    const pengurusAktif = pengurusList.filter((p) => {
      const mk = String(p.masa_khidmat || activeTa).trim();
      if (mk !== activeTa) return false;
      const st = String(p.status || 'aktif').toLowerCase().trim();
      if (st !== 'aktif') return false;
      const jabs = jabatanMap.get(p.id) || [];
      if (jabs.length > 0) {
        return jabs.some(
          (j) =>
            !isExcludedTopDivisiPengurus(String(j.divisi || '')) &&
            !isExcludedTopDivisiPengurus(String(j.nama_jabatan || ''))
        );
      }
      if (p.jabatan || p.divisi) {
        return !isExcludedTopPengurus(p);
      }
      return false;
    }).length;

    const allTransaksiList = ((transaksiRes.data || []) as TransaksiRow[]).map((tx) => ({
      ...tx,
      nominal: Number(tx.nominal || 0),
    }));
    const setting = (pengaturanRes.data || {}) as PengaturanRow;
    const localExt = readExtendedLocal();
    const mergedAturan = mergeAturanOperasional(
      setting.aturan_operasional ?? localExt?.aturan_operasional
    );
    const rawAturanObj =
      setting.aturan_operasional && typeof setting.aturan_operasional === 'object'
        ? (setting.aturan_operasional as Record<string, unknown>)
        : null;
    const resolvedKoreksiHijriyah =
      Number(
        setting.koreksi_hijriyah ??
          rawAturanObj?.koreksi_hijriyah ??
          mergedAturan.jadwal.koreksi_hijriyah ??
          0
      ) || 0;

    const jamaahMonthList = (jamaahRes.error ? [] : jamaahRes.data || []) as AbsenRow[];
    const izinActiveList = (izinRes.error ? [] : izinRes.data || []) as IzinPulangRow[];
    const sakitList = (sakitRes.error ? [] : sakitRes.data || []) as SantriSakitRow[];

    let pelanggaranList: KeamananPelanggaranRow[] = [];
    if (!keamananRes.error) {
      pelanggaranList = (keamananRes.data || []) as KeamananPelanggaranRow[];
    } else if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('siap_keamanan_pelanggaran_v1');
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) pelanggaranList = parsed as KeamananPelanggaranRow[];
      } catch {
        pelanggaranList = [];
      }
    }

    let sitaList: KeamananSitaRow[] = [];
    if (!sitaRes.error) {
      sitaList = (sitaRes.data || []) as KeamananSitaRow[];
    } else if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('siap_keamanan_sita_v1');
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) sitaList = parsed as KeamananSitaRow[];
      } catch {
        sitaList = [];
      }
    }

    const santriAktif = santriList.filter((s) =>
      ['aktif', 'ndalem', 'beasiswa_lazis'].includes(s.status)
    ).length;
    const santriNdalem = santriList.filter((s) => s.status === 'ndalem').length;
    const santriBeasiswa = santriList.filter((s) => s.status === 'beasiswa_lazis').length;

    const walletSummary = computeWalletAndTransferSummary(
      allTransaksiList,
      {
        pendaftaran: Number(setting.saldo_awal_pendaftaran || 0),
        operasional: Number(setting.saldo_awal_operasional || 0),
        kas_pondok: Number(setting.saldo_awal_kas_pondok || 0),
        mda: Number(setting.saldo_awal_mda || 0),
      },
      monthPrefix
    );
    const saldoPendaftaran = walletSummary.totals.pendaftaran;
    const saldoOperasional = walletSummary.totals.operasional;
    const saldoKasPondok = walletSummary.totals.kas_pondok;
    const saldoMda = walletSummary.totals.mda;
    const masukBulanIni = walletSummary.tunaiMasukBulanIni;
    const transferMasukBulanIni = walletSummary.syahriyahTransfer.bulanIniMasuk;
    const transferNetAllTime = walletSummary.syahriyahTransfer.netAllTime;

    const activeSantriIds = new Set(
      santriList
        .filter((s) => ['aktif', 'ndalem', 'beasiswa_lazis'].includes(s.status))
        .map((s) => s.id)
    );

    let jHadir = 0;
    let jSakit = 0;
    let jIzin = 0;
    let jAlpha = 0;
    let jTotal = 0;
    let subuhCount = 0;
    let dzuhurCount = 0;
    let asharCount = 0;
    let maghribCount = 0;
    let isyaCount = 0;

    let mHadir = 0;
    let mSakit = 0;
    let mIzin = 0;
    let mAlpha = 0;
    let mTotal = 0;
    const mDaysSet = new Set<string>();

    for (const row of jamaahMonthList) {
      if (row.santri_id && !activeSantriIds.has(row.santri_id)) continue;

      const rowStatus = String(row.status || '').toLowerCase().trim();
      const rowWaktu = String(row.waktu_sholat || '').toLowerCase().trim();

      mTotal += 1;
      if (row.tgl) mDaysSet.add(row.tgl);
      if (rowStatus === 'hadir') mHadir += 1;
      else if (rowStatus === 'sakit') mSakit += 1;
      else if (rowStatus === 'izin') mIzin += 1;
      else if (rowStatus === 'alpha') mAlpha += 1;

      if (row.tgl === todayIso) {
        jTotal += 1;
        if (rowStatus === 'hadir') jHadir += 1;
        else if (rowStatus === 'sakit') jSakit += 1;
        else if (rowStatus === 'izin') jIzin += 1;
        else if (rowStatus === 'alpha') jAlpha += 1;

        if (rowWaktu === 'subuh') subuhCount += 1;
        else if (rowWaktu === 'dzuhur') dzuhurCount += 1;
        else if (rowWaktu === 'ashar') asharCount += 1;
        else if (rowWaktu === 'maghrib') maghribCount += 1;
        else if (rowWaktu === 'isya') isyaCount += 1;
      }
    }

    const santriById = new Map(santriList.map((s) => [s.id, s]));

    let izinTidakMenginap = 0;
    let izinMenginap = 0;
    let izinTerlambat = 0;
    const izinPrioritasList: IzinPulangPrioritas[] = [];

    for (const row of izinActiveList) {
      if (row.jenis_izin === 'tidak_menginap') izinTidakMenginap += 1;
      else izinMenginap += 1;

      const meta = parseIzinMeta(row.alasan);
      const isLate =
        row.status === 'terlambat' ||
        todayIso > row.tgl_rencana_kembali ||
        (row.jenis_izin === 'tidak_menginap' &&
          todayIso === row.tgl_rencana_kembali &&
          currentHm > meta.batasJam);
      if (isLate) izinTerlambat += 1;

      const s = santriById.get(row.santri_id);
      const waRaw = meta.waPenjemput || s?.no_wa_wali || s?.no_wa_ayah || s?.no_wa_ibu || '';
      izinPrioritasList.push({
        id: row.id,
        santriNama: s?.nama_lengkap || 'Santri',
        kamar: s?.kamar || '-',
        jenisIzin: row.jenis_izin,
        tglRencanaKembali: row.tgl_rencana_kembali,
        batasJam: meta.batasJam,
        isLate,
        waDigits: toWaMeDigits(waRaw),
      });
    }
    izinPrioritasList.sort((a, b) => {
      if (a.isLate !== b.isLate) return a.isLate ? -1 : 1;
      return a.tglRencanaKembali.localeCompare(b.tglRencanaKembali);
    });

    // Hitung Ringkasan Santri Menunggak Syahriyah (sinkron dengan /keuangan?tab=tunggakan)
    const masterItems = (masterBayarRes.error ? [] : masterBayarRes.data || []) as MasterPembayaranItem[];
    const riwayatTarif = (riwayatTarifRes.error ? [] : riwayatTarifRes.data || []) as TarifRiwayatItem[];
    const paidSyahriyahMap = new Map<string, Set<string>>();
    if (!pembayaranRes.error && Array.isArray(pembayaranRes.data)) {
      for (const det of pembayaranRes.data as Array<{
        santri_id: string;
        item_kode: string;
        periode_bulan: string;
      }>) {
        const kodeNorm = String(det.item_kode || '').toLowerCase();
        if (!kodeNorm.startsWith('syahriyah')) continue;
        if (!det.periode_bulan) continue;
        if (!paidSyahriyahMap.has(det.santri_id)) paidSyahriyahMap.set(det.santri_id, new Set());
        paidSyahriyahMap.get(det.santri_id)!.add(det.periode_bulan);
      }
    }

    // Kecualikan juga bulan-bulan syahriyah yang tercatat lunas di keuangan_transaksi
    const taMonthsSet = new Set(taMonths);
    const activeSantriOnly = santriList.filter((s) => s.status === 'aktif');
    const activeSantriByLongestName = [...activeSantriOnly].sort(
      (a, b) => (b.nama_lengkap || '').trim().length - (a.nama_lengkap || '').trim().length
    );
    const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const tx of allTransaksiList) {
      if (tx.tipe !== 'masuk') continue;
      const kat = String(tx.kategori || '').toLowerCase();
      const ket = String(tx.keterangan || '');
      const isSyahriyahTx = tx.dompet === 'operasional' || kat.includes('syahriyah');
      if (!isSyahriyahTx) continue;
      const periodes = extractPeriodeTokens(`${kat} ${ket}`).filter((p) => taMonthsSet.has(p));
      if (periodes.length === 0) continue;
      const ketLower = ket.toLowerCase();
      const nisMatched = activeSantriOnly.filter((s) => {
        const nisClean = String(s.nis || '').trim().toLowerCase();
        if (nisClean.length < 3) return false;
        return new RegExp(`(^|[^a-z0-9])${escapeRe(nisClean)}([^a-z0-9]|$)`).test(ketLower);
      });
      const matchedSantri =
        nisMatched.length > 0
          ? nisMatched
          : (() => {
              const found = activeSantriByLongestName.find((s) => {
                const namaClean = String(s.nama_lengkap || '').trim().toLowerCase();
                if (namaClean.length < 4) return false;
                return new RegExp(`(^|[^a-z0-9])${escapeRe(namaClean)}([^a-z0-9]|$)`).test(ketLower);
              });
              return found ? [found] : [];
            })();
      for (const s of matchedSantri) {
        if (!paidSyahriyahMap.has(s.id)) paidSyahriyahMap.set(s.id, new Set());
        const set = paidSyahriyahMap.get(s.id)!;
        periodes.forEach((p) => set.add(p));
      }
    }

    const resolveNominalForKode = (kode: string, dateTarget: string, fallback: number): number => {
      const m = masterItems.find((item) => item.kode === kode);
      if (!m) return fallback;
      const list = riwayatTarif.filter((r) => r.item_id === m.id);
      if (list.length === 0) return fallback;
      return getTarifAktifFromRiwayat(list, dateTarget).nominal || fallback;
    };

    const skemaPsb = mergedAturan.pendaftaran;
    const tunggakanList: TunggakanSantriPrioritas[] = [];
    let tunggakanWaCount = 0;
    let tunggakanSuratCount = 0;
    let tunggakanTotalNominal = 0;

    for (const s of activeSantriOnly) {
      const paidSet = paidSyahriyahMap.get(s.id) || new Set<string>();
      const startPeriode = getStartPeriodeDariTglMasuk(s.tgl_masuk);
      const k = (s.kamar || '').toUpperCase();
      const isVip = k.includes('VIP') || k.includes('FACHRIYAH') || Number(s.tarif_syahriyah) >= 500000;
      let unpaidMonths = 0;
      let unpaidNom = 0;

      for (const p of taMonths) {
        if (startPeriode && p < startPeriode) continue;
        if (!paidSet.has(p)) {
          unpaidMonths += 1;
          const dateTarget = `${p}-01`;
          if (isVip) {
            unpaidNom += resolveNominalForKode(
              'syahriyah_vip',
              dateTarget,
              skemaPsb.syahriyah_vip || 500000
            );
          } else {
            unpaidNom += resolveNominalForKode(
              'syahriyah_reguler',
              dateTarget,
              skemaPsb.syahriyah_reguler || 450000
            );
          }
        }
      }

      const ktlNominal = Number(s.ktl_nominal || 0);
      const totalTagihan = unpaidNom + ktlNominal;
      if (unpaidMonths > 0 || ktlNominal > 0) {
        const jalur: 'WA_1_2' | 'SURAT_3_PLUS' = unpaidMonths >= 3 ? 'SURAT_3_PLUS' : 'WA_1_2';
        if (jalur === 'SURAT_3_PLUS') tunggakanSuratCount += 1;
        else tunggakanWaCount += 1;
        tunggakanTotalNominal += totalTagihan;
        tunggakanList.push({
          santriId: s.id,
          nama: s.nama_lengkap || 'Santri',
          kamar: s.kamar || '-',
          jumlahBulan: unpaidMonths,
          ktlNominal,
          totalTagihan,
          jalur,
        });
      }
    }
    tunggakanList.sort((a, b) => {
      if (b.jumlahBulan !== a.jumlahBulan) return b.jumlahBulan - a.jumlahBulan;
      return b.totalTagihan - a.totalTagihan;
    });

    let dirawatUks = 0;
    let dirujuk = 0;
    let sembuhBulanIni = 0;
    let sakitPeringatan3Hari = 0;

    for (const row of sakitList) {
      if (row.status === 'rawat_uks') {
        dirawatUks += 1;
        if (calcDiffDaysIso(row.tgl_sakit, todayIso) >= 3) sakitPeringatan3Hari += 1;
      } else if (row.status === 'dirujuk') {
        dirujuk += 1;
        if (calcDiffDaysIso(row.tgl_sakit, todayIso) >= 3) sakitPeringatan3Hari += 1;
      } else if (row.status === 'sembuh') {
        const tglRef = row.tgl_sembuh || row.tgl_sakit || '';
        if (tglRef.startsWith(monthPrefix)) sembuhBulanIni += 1;
      }
    }

    let takzirBelumSelesai = 0;
    let kasusBulanIni = 0;
    const poinMap = new Map<string, { totalPoin: number; kasusCount: number }>();

    for (const p of pelanggaranList) {
      if (p.status_takzir === 'belum_selesai') takzirBelumSelesai += 1;
      if ((p.tanggal || '').startsWith(monthPrefix)) kasusBulanIni += 1;
      const cur = poinMap.get(p.santri_id) || { totalPoin: 0, kasusCount: 0 };
      cur.totalPoin += Number(p.poin || 0);
      cur.kasusCount += 1;
      poinMap.set(p.santri_id, cur);
    }

    let santriAmbangSp = 0;
    const topPoinList: TopPoinSantri[] = [];
    for (const [santriId, agg] of poinMap.entries()) {
      if (agg.totalPoin >= 25) santriAmbangSp += 1;
      if (agg.totalPoin > 0) {
        const s = santriById.get(santriId);
        topPoinList.push({
          santriId,
          nama: s?.nama_lengkap || 'Santri',
          kamar: s?.kamar || '-',
          totalPoin: agg.totalPoin,
          kasusCount: agg.kasusCount,
        });
      }
    }
    topPoinList.sort((a, b) => b.totalPoin - a.totalPoin);
    const barangDisita = sitaList.filter((s) => s.status === 'disita').length;

    const sesiDapurList = dapurSesiRes.rows || [];
    const menuDapurList = dapurMenuRes.rows || [];
    const kasDapurList = dapurKasRes.rows || [];

    const todayPagi = sesiDapurList.find((s) => s.tanggal === todayIso && s.shift === 'pagi');
    const todaySore = sesiDapurList.find((s) => s.tanggal === todayIso && s.shift === 'sore');
    const formatSesiLabel = (s?: DapurSesiMasak) => {
      if (!s) return 'Belum Mulai';
      if (s.status_waktu === 'sedang_masak') return `Masak (${formatTimeClock(s.started_at, false)})`;
      if (s.status_waktu === 'tepat_waktu') return `Tepat (${formatTimeClock(s.finished_at, false)})`;
      if (s.status_waktu === 'terlambat') return `Telat +${s.selisih_menit}m`;
      return 'Belum Mulai';
    };

    const dapurTimeliness = computeCookingTimelinessStats(sesiDapurList, monthPrefix);
    const saldoKasDapur = kasDapurList.reduce(
      (sum, item) => sum + (item.jenis === 'masuk' ? Number(item.nominal || 0) : -Number(item.nominal || 0)),
      0
    );
    const menuPagiToday = menuDapurList.find((m) => m.tanggal === todayIso && m.shift === 'pagi');
    const menuSoreToday = menuDapurList.find((m) => m.tanggal === todayIso && m.shift === 'sore');

    const sarprasInvList = sarprasInvRes.rows || [];
    const sarprasLapList = sarprasLapRes.rows || [];
    let srpMenunggu = 0;
    let srpDiproses = 0;
    let srpSelesaiBulanIni = 0;
    let srpDaruratAktif = 0;
    const srpActiveList: SarprasLaporanItem[] = [];

    for (const r of sarprasLapList) {
      const st = String(r.status || '').toLowerCase().trim();
      if (st === 'menunggu') {
        srpMenunggu += 1;
        srpActiveList.push(r);
      } else if (st === 'diproses' || st === 'proses') {
        srpDiproses += 1;
        srpActiveList.push(r);
      } else if (st === 'selesai') {
        const ref = r.tgl_selesai || r.tanggal_lapor || '';
        if (ref.startsWith(monthPrefix)) srpSelesaiBulanIni += 1;
      }
      if (st !== 'selesai' && String(r.urgensi || '').toLowerCase() === 'darurat') srpDaruratAktif += 1;
    }

    srpActiveList.sort((a, b) => (b.tanggal_lapor || '').localeCompare(a.tanggal_lapor || ''));
    const srpAsetRusak = sarprasInvList.filter(
      (i) => String(i.kondisi || 'baik').toLowerCase().trim() !== 'baik'
    ).length;

    const weekEndIso = addDaysIso(todayIso, 7);
    const activeKegiatan = (kegiatanListRes || []).filter(
      (k) => k.status !== 'selesai' && k.status !== 'ditunda'
    );
    let kgtPekanIni = 0;
    let kgtEventBesar = 0;
    let kgtPengisiTerisi = 0;
    let kgtPengisiTotal = 0;
    for (const k of activeKegiatan) {
      if (k.tanggal >= todayIso && k.tanggal <= weekEndIso) kgtPekanIni += 1;
      if (k.kategori === 'event_besar') kgtEventBesar += 1;
      const p = countPengisiProgress(k.pengisi_list);
      kgtPengisiTerisi += p.terisi;
      kgtPengisiTotal += p.total;
    }
    const upcomingKegiatan = activeKegiatan
      .filter((k) => k.tanggal >= todayIso)
      .sort((a, b) =>
        a.tanggal !== b.tanggal
          ? a.tanggal.localeCompare(b.tanggal)
          : (a.jam_mulai || '').localeCompare(b.jam_mulai || '')
      )
      .slice(0, 3);

    const todayHariKey = getHariKeyFromIso(todayIso);
    const todayLiburLaundry = isHariLiburLaundry(todayIso);
    const todayJadwalRow = laundryJadwalRes.find((j) => j.hari_key === todayHariKey);
    const todayLaundryRows = (laundryCatatanRes || [])
      .filter((c) => c.tanggal === todayIso)
      .sort((a, b) => a.kamar.localeCompare(b.kamar, 'id'));
    let lndPotong = 0;
    let lndSelesai = 0;
    let lndMasuk = 0;
    for (const lr of todayLaundryRows) {
      lndPotong += Number(lr.jumlah_potong || 0);
      if (lr.status === 'selesai') lndSelesai += 1;
      else lndMasuk += 1;
    }

    return {
      tahunAjaran: `${startYear}/${startYear + 1}`,
      bulanLabel: `${namaBulan[Math.max(0, Math.min(11, mmNum - 1))]} ${yyyy}`,
      menuCepatIds: mergedAturan.menu_cepat_ids,
      koreksiHijriyah: resolvedKoreksiHijriyah,
      rawPengaturanDb: setting,
      stats: {
        santriAktif,
        santriNdalem,
        santriBeasiswa,
        pengurusAktif,
        totalPersonel: santriList.length,
        saldoOperasional,
        saldoPendaftaran,
        saldoKasPondok,
        saldoMda,
        masukBulanIni,
        transferMasukBulanIni,
        transferNetAllTime,
        namaPesantren: setting.nama_pesantren || 'Pondok Pesantren An-Nur 1 Bululawang',
      },
      jamaahToday: {
        total: jTotal,
        hadir: jHadir,
        sakit: jSakit,
        izin: jIzin,
        alpha: jAlpha,
        persenHadir: jTotal > 0 ? Math.round((jHadir / jTotal) * 100) : 0,
        subuhCount,
        dzuhurCount,
        asharCount,
        maghribCount,
        isyaCount,
      },
      jamaahMonthly: {
        total: mTotal,
        hadir: mHadir,
        sakit: mSakit,
        izin: mIzin,
        alpha: mAlpha,
        persenHadir: mTotal > 0 ? Math.round((mHadir / mTotal) * 100) : 0,
        hariTercatat: mDaysSet.size,
      },
      izinStats: {
        sedangPulang: izinActiveList.length,
        terlambat: izinTerlambat,
        tidakMenginap: izinTidakMenginap,
        menginap: izinMenginap,
      },
      izinPrioritasList,
      tunggakanSummary: {
        totalSantri: tunggakanList.length,
        waCount: tunggakanWaCount,
        suratCount: tunggakanSuratCount,
        totalNominal: tunggakanTotalNominal,
        previewList: tunggakanList.slice(0, 5),
      },
      kesehatanStats: {
        dirawatUks,
        dirujuk,
        sembuhBulanIni,
        totalAktif: dirawatUks + dirujuk,
        peringatan3Hari: sakitPeringatan3Hari,
      },
      keamananStats: {
        takzirBelumSelesai,
        kasusBulanIni,
        santriAmbangSp,
        barangDisita,
        topPoinList: topPoinList.slice(0, 3),
      },
      dapurStats: {
        pagiLabel: formatSesiLabel(todayPagi),
        pagiStatus: todayPagi?.status_waktu || 'belum_mulai',
        soreLabel: formatSesiLabel(todaySore),
        soreStatus: todaySore?.status_waktu || 'belum_mulai',
        persenTepatWaktu: dapurTimeliness.persenTepatWaktu,
        tepatWaktuCount: dapurTimeliness.tepatWaktuCount,
        totalSelesai: dapurTimeliness.totalSelesai,
        saldoKas: saldoKasDapur,
        menuPagi: menuPagiToday
          ? [menuPagiToday.menu_utama, menuPagiToday.sayur_pendamping, menuPagiToday.lauk_tambahan]
              .filter(Boolean)
              .join(' + ')
          : 'Belum dijadwalkan',
        menuSore: menuSoreToday
          ? [menuSoreToday.menu_utama, menuSoreToday.sayur_pendamping, menuSoreToday.lauk_tambahan]
              .filter(Boolean)
              .join(' + ')
          : 'Belum dijadwalkan',
      },
      sarprasInventaris: sarprasInvList,
      sarprasLaporan: sarprasLapList,
      sarprasStats: {
        menunggu: srpMenunggu,
        diproses: srpDiproses,
        selesaiBulanIni: srpSelesaiBulanIni,
        asetRusak: srpAsetRusak,
        daruratAktif: srpDaruratAktif,
        recentActive: srpActiveList.slice(0, 3),
      },
      kegiatanStats: {
        agendaAktif: activeKegiatan.length,
        pekanIni: kgtPekanIni,
        eventBesarAktif: kgtEventBesar,
        pengisiTerisi: kgtPengisiTerisi,
        pengisiTotal: kgtPengisiTotal,
        upcomingList: upcomingKegiatan,
        todayIso,
      },
      laundryStats: {
        hariLabel: HARI_LABEL_MAP[todayHariKey],
        isLibur: todayLiburLaundry,
        kamarTerjadwal: todayLiburLaundry ? 0 : todayJadwalRow?.kamar_list.length || 0,
        kamarSetor: todayLaundryRows.length,
        totalPotong: lndPotong,
        selesaiCount: lndSelesai,
        masukCount: lndMasuk,
        todayRecords: todayLaundryRows,
      },
    };
  };

  const loadDashboard = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await fetchDashboardData();
      setTahunAjaran(result.tahunAjaran);
      setBulanLabel(result.bulanLabel);
      setMenuCepatIds(result.menuCepatIds);
      setKoreksiHijriyah(result.koreksiHijriyah);
      setRawPengaturanDb(result.rawPengaturanDb);
      setStats(result.stats);
      setJamaahToday(result.jamaahToday);
      setJamaahMonthly(result.jamaahMonthly);
      setIzinStats(result.izinStats);
      setIzinPrioritasList(result.izinPrioritasList);
      setTunggakanSummary(result.tunggakanSummary);
      setKesehatanStats(result.kesehatanStats);
      setKeamananStats(result.keamananStats);
      setDapurStats(result.dapurStats);
      setSarprasInventaris(result.sarprasInventaris);
      setSarprasLaporan(result.sarprasLaporan);
      setSarprasStats(result.sarprasStats);
      setKegiatanStats(result.kegiatanStats);
      setLaundryStats(result.laundryStats);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat ringkasan database.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      setNowClock(new Date());
      setMobileNavHrefs(readMobileNavPrefs());
    }, 0);
    const interval = setInterval(() => {
      setNowClock(new Date());
    }, 1000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchDashboardData()
      .then((result) => {
        if (!active) return;
        setTahunAjaran(result.tahunAjaran);
        setBulanLabel(result.bulanLabel);
        setMenuCepatIds(result.menuCepatIds);
        setKoreksiHijriyah(result.koreksiHijriyah);
        setRawPengaturanDb(result.rawPengaturanDb);
        setStats(result.stats);
        setJamaahToday(result.jamaahToday);
        setJamaahMonthly(result.jamaahMonthly);
        setIzinStats(result.izinStats);
        setIzinPrioritasList(result.izinPrioritasList);
        setTunggakanSummary(result.tunggakanSummary);
        setKesehatanStats(result.kesehatanStats);
        setKeamananStats(result.keamananStats);
        setDapurStats(result.dapurStats);
        setSarprasInventaris(result.sarprasInventaris);
        setSarprasLaporan(result.sarprasLaporan);
        setSarprasStats(result.sarprasStats);
        setKegiatanStats(result.kegiatanStats);
        setLaundryStats(result.laundryStats);
      })
      .catch((err) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Gagal memuat ringkasan database.';
        setErrorMsg(msg);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canViewBisyaroh]);

  const todayCalendarInfo = useMemo(() => {
    if (!nowClock) {
      return {
        todayIso: '',
        masehiPasaran: 'Memuat tanggal...',
        hijri: {
          day: 1,
          month: 1,
          year: 1448,
          monthName: 'Muharram',
          arabicDay: '١',
          formatted: 'Memuat Hijriyah...',
        },
        sholat: {
          isoDate: '',
          imsak: '--:--',
          subuh: '--:--',
          terbit: '--:--',
          dhuha: '--:--',
          dzuhur: '--:--',
          ashar: '--:--',
          maghrib: '--:--',
          isya: '--:--',
        },
        countdown: {
          nextName: 'Sholat',
          nextTime: '--:--',
          remainingSeconds: 0,
          remainingFormatted: '- -- : -- : --',
        },
      };
    }
    const todayIso = getWibTodayIso(nowClock);
    const masehiPasaran = formatHariPasaranIndo(todayIso);
    const hijri = getHijriDate(todayIso, koreksiHijriyah);
    const sholat = computeJadwalSholatBululawang(todayIso);
    const countdown = getNextPrayerCountdown(nowClock, sholat);
    return { todayIso, masehiPasaran, hijri, sholat, countdown };
  }, [nowClock, koreksiHijriyah]);

  const quickMenuItems = useMemo(() => {
    const ids = normalizeMenuCepatIds(menuCepatIds);
    return ids
      .map((id) => QUICK_MENU_CATALOG.find((item) => item.id === id))
      .filter((item): item is QuickMenuCatalogItem => Boolean(item));
  }, [menuCepatIds]);

  const handleSaveQuickConfig = async (nextMenuIds: string[], nextMobileHrefs: string[]) => {
    setSavingQuickConfig(true);
    try {
      const normalizedIds = normalizeMenuCepatIds(nextMenuIds);
      const updatedNav = writeMobileNavPrefs(nextMobileHrefs);
      setMenuCepatIds(normalizedIds);
      setMobileNavHrefs(updatedNav);

      const localExt = readExtendedLocal();
      const baseAturan = mergeAturanOperasional(
        rawPengaturanDb?.aturan_operasional ?? localExt?.aturan_operasional
      );
      const nextAturan = {
        ...baseAturan,
        menu_cepat_ids: normalizedIds,
      };

      const nextExtended = {
        kota_surat: rawPengaturanDb?.kota_surat || localExt?.kota_surat || 'Bululawang, Malang',
        rekening_bank:
          rawPengaturanDb?.rekening_bank || localExt?.rekening_bank || 'BSI (Bank Syariah Indonesia)',
        rekening_nomor: rawPengaturanDb?.rekening_nomor || localExt?.rekening_nomor || '',
        rekening_atas_nama:
          rawPengaturanDb?.rekening_atas_nama ||
          localExt?.rekening_atas_nama ||
          'Pondok Pesantren An-Nur 1',
        kop_surat_url: rawPengaturanDb?.kop_surat_url || localExt?.kop_surat_url || '',
        aturan_operasional: nextAturan,
      };

      writeExtendedLocal(nextExtended);

      if (rawPengaturanDb?.id) {
        const { error } = await supabase
          .from('pengaturan_aplikasi')
          .update({ aturan_operasional: nextAturan })
          .eq('id', rawPengaturanDb.id);
        if (error && !isMissingColumnError(error)) {
          throw error;
        }
        setRawPengaturanDb((prev) =>
          prev ? { ...prev, aturan_operasional: nextAturan } : prev
        );
      }

      setQuickConfigOpen(false);
      setQuickToast('Menu Cepat Beranda & Bottom Nav HP berhasil diperbarui.');
      setTimeout(() => setQuickToast(null), 3500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan pengaturan menu.';
      setQuickToast(`Disimpan di perangkat (${msg}).`);
      setQuickConfigOpen(false);
      setTimeout(() => setQuickToast(null), 4000);
    } finally {
      setSavingQuickConfig(false);
    }
  };

  const total4Dompet =
    stats.saldoPendaftaran + stats.saldoOperasional + stats.saldoKasPondok + stats.saldoMda;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* HEADER BANNER COMPACT */}
      <div className="siap-hero rounded-2xl p-4 sm:p-5 text-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-white/85">
            <span className="px-2.5 py-0.5 bg-white/15 rounded-md border border-white/25 text-white">
              TA {tahunAjaran || '...'}
            </span>
            <span className="px-2.5 py-0.5 bg-white/15 rounded-md border border-white/25 text-white tabular-nums">
              {loading ? '...' : `${stats.pengurusAktif} Pengurus Aktif`}
            </span>
            <span className="truncate">{stats.namaPesantren}</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-bold mt-1.5 tracking-tight">
            Beranda Pengurus e-annursatu
          </h1>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="min-h-[38px] px-3 py-1.5 bg-black/20 hover:bg-black/30 text-white text-xs font-semibold rounded-xl border border-white/25 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>
          <button
            type="button"
            onClick={() => setShowSarprasReportModal(true)}
            className="min-h-[38px] px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-xl border border-white/30 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            Lapor Sarpras
          </button>
          <Link
            href="/santri"
            style={{ backgroundColor: '#ffffff', color: 'var(--siap-sidebar)' }}
            className="col-span-2 sm:col-span-1 min-h-[38px] px-3.5 py-1.5 bg-white dark:!bg-white text-xs font-bold rounded-xl shadow-xs hover:bg-slate-50 dark:hover:!bg-slate-100 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            Data Santri
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5 text-rose-900 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Kendala Koneksi Database:</span> {errorMsg}
          </div>
        </div>
      )}

      {quickToast && (
        <div className="siap-soft-box border rounded-xl p-3 flex items-center gap-2 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 siap-text-accent shrink-0" />
          <span>{quickToast}</span>
        </div>
      )}

      {/* BANNER KALENDER MASEHI / HIJRIYAH & JADWAL SHOLAT BULULAWANG */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold siap-text-accent">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>Bululawang, Kab. Malang (WIB)</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-900">
              {todayCalendarInfo.masehiPasaran}
            </p>
            <p className="text-xs font-semibold siap-text-accent">
              {todayCalendarInfo.hijri.formatted} H
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 siap-soft-box border rounded-xl px-3.5 py-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider siap-text-accent block">
                Menuju {todayCalendarInfo.countdown.nextName}
              </span>
              <strong className="text-base sm:text-lg font-extrabold text-slate-900 tabular-nums">
                {todayCalendarInfo.countdown.nextTime} WIB
              </strong>
            </div>
            <div className="text-right border-l border-current/20 pl-3">
              <span className="text-[10px] font-semibold siap-text-accent block">Hitung Mundur</span>
              <span className="font-mono text-xs sm:text-sm font-bold text-slate-900 tabular-nums">
                {todayCalendarInfo.countdown.remainingFormatted}
              </span>
            </div>
            <Link
              href="/kalender"
              className="p-2 rounded-lg siap-btn-primary shrink-0 transition-colors"
              title="Buka Kalender Masehi & Hijriyah"
              aria-label="Buka Kalender Masehi & Hijriyah"
            >
              <CalendarDays className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Strip 5 Waktu + Imsak */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center text-[11px]">
          {[
            { label: 'Imsak', time: todayCalendarInfo.sholat.imsak },
            { label: 'Subuh', time: todayCalendarInfo.sholat.subuh },
            { label: 'Dzuhur', time: todayCalendarInfo.sholat.dzuhur },
            { label: 'Ashar', time: todayCalendarInfo.sholat.ashar },
            { label: 'Maghrib', time: todayCalendarInfo.sholat.maghrib },
            { label: 'Isya', time: todayCalendarInfo.sholat.isya },
          ].map((slot) => {
            const isNext = todayCalendarInfo.countdown.nextName === slot.label;
            return (
              <div
                key={slot.label}
                className={`rounded-lg px-2 py-1.5 border tabular-nums ${
                  isNext
                    ? 'siap-btn-primary border-transparent font-bold shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <span className={`block text-[10px] ${isNext ? 'text-white/85' : 'text-slate-500'}`}>
                  {slot.label}
                </span>
                <span className="font-mono font-bold text-xs">{slot.time}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* MENU CEPAT PENGURUS (CUSTOMIZABLE + BOTTOM NAV PREFS) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 siap-text-accent shrink-0" />
            <h2 className="font-bold text-sm text-slate-900">Menu Cepat Divisi</h2>
          </div>
          <button
            type="button"
            onClick={() => setQuickConfigOpen(true)}
            className="min-h-[34px] px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Atur Menu &amp; Bottom Nav
          </button>
        </div>

        <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-2.5">
          {quickMenuItems.map((item) => {
            const tone = TONE_CLASSES[item.tone] || TONE_CLASSES.emerald;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border border-slate-200 bg-white hover:border-[var(--siap-primary)] transition-all text-center"
              >
                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${tone.bg} ${tone.border} border flex items-center justify-center ${tone.iconText} group-hover:scale-105 transition-transform`}
                >
                  {renderQuickMenuIcon(item.iconKey, 'w-4 h-4 sm:w-5 sm:h-5')}
                </div>
                <span className="mt-1.5 text-[11px] sm:text-xs font-semibold text-slate-700 leading-tight line-clamp-1">
                  {item.shortLabel}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 4 KPI UTAMA (NOMINAL TABULAR TANPA TRUNCATE DI HP) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">Santri Aktif</span>
            <Users className="w-4 h-4 text-sky-600 shrink-0" />
          </div>
          <div className="mt-2">
            <strong className="text-lg sm:text-2xl font-extrabold text-slate-900 tabular-nums block">
              {loading ? '...' : stats.santriAktif}
            </strong>
            <span className="text-[10.5px] text-slate-500 block mt-0.5">
              {stats.santriNdalem} Ndalem &bull; {stats.santriBeasiswa} Beasiswa &bull; {stats.pengurusAktif} Pengurus
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">Syahriyah (Tunai)</span>
            <Wallet className="w-4 h-4 siap-text-accent shrink-0" />
          </div>
          <div className="mt-2">
            <strong className="text-sm sm:text-lg font-extrabold siap-text-accent tabular-nums block leading-snug">
              {loading ? '...' : formatRupiah(stats.saldoOperasional)}
            </strong>
            <span className="text-[10.5px] text-slate-500 block mt-0.5 tabular-nums">
              Tunai {bulanLabel}: {formatRupiah(stats.masukBulanIni)}
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">Total 4 Dompet Tunai</span>
            <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0" />
          </div>
          <div className="mt-2">
            <strong className="text-sm sm:text-lg font-extrabold text-slate-900 tabular-nums block leading-snug">
              {loading ? '...' : formatRupiah(total4Dompet)}
            </strong>
            <span className="text-[10.5px] text-sky-700 font-medium block mt-0.5 tabular-nums">
              Transfer {bulanLabel}: {formatRupiah(stats.transferMasukBulanIni)}
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">Jamaah {bulanLabel}</span>
            <CalendarCheck className="w-4 h-4 siap-text-accent shrink-0" />
          </div>
          <div className="mt-2">
            <strong className="text-lg sm:text-2xl font-extrabold text-slate-900 tabular-nums block">
              {loading
                ? '...'
                : jamaahMonthly.total > 0
                ? `${jamaahMonthly.persenHadir}%`
                : '0%'}
            </strong>
            <span className="text-[10.5px] text-slate-500 block mt-0.5 tabular-nums">
              Hari ini: {jamaahToday.total > 0 ? `${jamaahToday.persenHadir}% hadir` : 'Belum input'}
            </span>
          </div>
        </div>
      </div>

      {/* 2 KARTU PRIORITAS HARIAN: SANTRI PULANG & TERLAMBAT + SANTRI MENUNGGAK SYAHRIYAH */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* Kartu 1: Santri Pulang & Terlambat */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <DoorOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-sm text-slate-900 truncate">
                  Santri Pulang &amp; Terlambat
                </h2>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {loading
                    ? 'Memuat...'
                    : `${izinStats.sedangPulang} sedang izin pulang · ${izinStats.terlambat} terlambat kembali`}
                </p>
              </div>
            </div>
            <Link
              href="/perizinan"
              className="text-xs font-bold siap-text-accent hover:underline inline-flex items-center gap-0.5 shrink-0 whitespace-nowrap"
            >
              Kelola <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {izinPrioritasList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3.5 text-center text-xs text-slate-500">
              Seluruh santri berada di pondok (tidak ada izin pulang aktif saat ini).
            </div>
          ) : (
            <div className="space-y-2">
              {izinPrioritasList.slice(0, 4).map((item) => {
                const waText = encodeURIComponent(
                  `Assalamu'alaikum Wali dari *${item.santriNama}* (Kamar ${item.kamar}). Mengingatkan batas waktu kembali ke Pondok Pesantren An-Nur 1 pada ${item.tglRencanaKembali} pukul ${item.batasJam} WIB. Mohon konfirmasinya.`
                );
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                      item.isLate
                        ? 'bg-rose-50/80 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-900 truncate">{item.santriNama}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                          {item.kamar}
                        </span>
                        {item.isLate && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-600 text-white">
                            Terlambat Kembali
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                        Rencana kembali: {item.tglRencanaKembali} ({item.batasJam} WIB)
                      </p>
                    </div>
                    {item.waDigits ? (
                      <a
                        href={`https://wa.me/${item.waDigits}?text=${waText}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg siap-btn-primary text-[11px] font-bold inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WA Wali
                      </a>
                    ) : (
                      <Link
                        href="/perizinan"
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-[11px] font-semibold shrink-0"
                      >
                        Detail
                      </Link>
                    )}
                  </div>
                );
              })}
              {izinPrioritasList.length > 4 && (
                <p className="text-[11px] text-slate-500 text-right">
                  +{izinPrioritasList.length - 4} santri lainnya pada daftar Perizinan
                </p>
              )}
            </div>
          )}
        </section>

        {/* Kartu 2: Santri Menunggak Syahriyah */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
                <Receipt className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-sm text-slate-900 truncate">
                  Santri Menunggak Syahriyah
                </h2>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {loading
                    ? 'Memuat...'
                    : `${tunggakanSummary.totalSantri} santri · Total ${formatRupiah(
                        tunggakanSummary.totalNominal
                      )}`}
                </p>
              </div>
            </div>
            <Link
              href="/keuangan?tab=tunggakan"
              className="text-xs font-bold siap-text-accent hover:underline inline-flex items-center gap-0.5 shrink-0 whitespace-nowrap"
            >
              Penagihan <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
              <span className="text-[10.5px] font-semibold text-amber-900 block">
                Jalur 1–2 Bulan (WA)
              </span>
              <strong className="text-base font-extrabold text-amber-950 tabular-nums">
                {loading ? '...' : `${tunggakanSummary.waCount} santri`}
              </strong>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2">
              <span className="text-[10.5px] font-semibold text-rose-900 block">
                Jalur ≥ 3 Bulan (Surat)
              </span>
              <strong className="text-base font-extrabold text-rose-800 tabular-nums">
                {loading ? '...' : `${tunggakanSummary.suratCount} santri`}
              </strong>
            </div>
          </div>

          {tunggakanSummary.previewList.length === 0 ? (
            <div className="rounded-xl border border-dashed siap-soft-box p-3 text-center text-xs font-medium">
              Alhamdulillah, seluruh syahriyah santri sampai jatuh tempo bulan ini sudah lunas.
            </div>
          ) : (
            <div className="space-y-1.5">
              {tunggakanSummary.previewList.slice(0, 3).map((row) => (
                <div
                  key={row.santriId}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 truncate block">
                      {row.nama}{' '}
                      <span className="font-normal text-slate-500">({row.kamar})</span>
                    </span>
                    <span className="text-[10.5px] text-slate-500 tabular-nums">
                      {row.jumlahBulan} bulan belum bayar
                      {row.ktlNominal > 0 ? ' + KTL' : ''}
                    </span>
                  </div>
                  <span
                    className={`font-mono font-bold tabular-nums shrink-0 ${
                      row.jalur === 'SURAT_3_PLUS' ? 'text-rose-700' : 'text-amber-800'
                    }`}
                  >
                    {formatRupiah(row.totalTagihan)}
                  </span>
                </div>
              ))}
              <Link
                href="/keuangan?tab=tunggakan"
                className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-900 text-xs font-bold flex items-center justify-between transition-colors"
              >
                <span>Buka Daftar Tunggakan &amp; Penagihan WA/Surat</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* TOAST SARPRAS JIKA BARU KIRIM LAPORAN */}
      {sarprasToast && (
        <div className="p-3 rounded-xl siap-soft-box border text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 siap-text-accent shrink-0" />
            <span>{sarprasToast}</span>
          </div>
          <Link href="/sarpras" className="font-bold siap-text-accent hover:underline whitespace-nowrap shrink-0">
            Lihat Antrean &rarr;
          </Link>
        </div>
      )}

      {/* RINGKASAN DIVISI RINGKAS & INFORMATIF */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* 1. KEUANGAN 4 DOMPET */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 siap-text-accent shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">Keuangan 4 Dompet (Tunai)</h3>
            </div>
            <Link
              href="/keuangan"
              className="text-xs font-semibold siap-text-accent hover:underline inline-flex items-center gap-0.5 shrink-0"
            >
              Loket <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200">
              <span className="text-[10.5px] font-semibold text-sky-900 block">1. Pendaftaran</span>
              <strong className="text-xs sm:text-sm font-bold text-sky-950 tabular-nums">
                {loading ? '...' : formatRupiah(stats.saldoPendaftaran)}
              </strong>
            </div>
            <div className="p-2.5 rounded-xl siap-soft-box border">
              <span className="text-[10.5px] font-semibold siap-text-accent block">2. Syahriyah</span>
              <strong className="text-xs sm:text-sm font-bold text-slate-900 tabular-nums">
                {loading ? '...' : formatRupiah(stats.saldoOperasional)}
              </strong>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <span className="text-[10.5px] font-semibold text-amber-900 block">3. Kas Umum</span>
              <strong className="text-xs sm:text-sm font-bold text-amber-950 tabular-nums">
                {loading ? '...' : formatRupiah(stats.saldoKasPondok)}
              </strong>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200">
              <span className="text-[10.5px] font-semibold text-purple-900 block">4. Dompet MDA</span>
              <strong className="text-xs sm:text-sm font-bold text-purple-950 tabular-nums">
                {loading ? '...' : formatRupiah(stats.saldoMda)}
              </strong>
            </div>
          </div>
          <div className="px-2.5 py-2 rounded-xl bg-sky-50/70 border border-sky-200 flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-sky-900">Pemasukan Transfer</span>
            <strong className="font-bold text-sky-950 font-mono tabular-nums">
              {loading ? '...' : formatRupiah(stats.transferNetAllTime)}
            </strong>
          </div>
        </div>

        {/* 2. ABSEN JAMAAH */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-sky-700 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">Absen Sholat Jamaah</h3>
            </div>
            <Link
              href="/absen-jamaah"
              className="text-xs font-semibold siap-text-accent hover:underline inline-flex items-center gap-0.5 shrink-0"
            >
              Input <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
            <div className="p-2 rounded-xl siap-soft-box border">
              <span className="text-[10px] text-slate-600 block">Hadir</span>
              <strong className="text-sm font-bold siap-text-accent tabular-nums">
                {loading ? '...' : jamaahToday.hadir}
              </strong>
            </div>
            <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
              <span className="text-[10px] text-rose-800 block">Alpha</span>
              <strong className="text-sm font-bold text-rose-700 tabular-nums">
                {loading ? '...' : jamaahToday.alpha}
              </strong>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-600 block">Izin</span>
              <strong className="text-sm font-bold text-sky-700 tabular-nums">
                {loading ? '...' : jamaahToday.izin}
              </strong>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-600 block">Sakit</span>
              <strong className="text-sm font-bold text-amber-700 tabular-nums">
                {loading ? '...' : jamaahToday.sakit}
              </strong>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 tabular-nums">
            Hari ini: {jamaahToday.total} input &bull; Bulan ini: <strong>{jamaahMonthly.hariTercatat} hari</strong> ({jamaahMonthly.alpha} alpha)
          </p>
        </div>

        {/* 3. PERIZINAN & POSKESTREN */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DoorOpen className="w-4 h-4 text-amber-600 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">Perizinan &amp; Poskestren</h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold shrink-0">
              <Link href="/perizinan" className="siap-text-accent hover:underline">
                Izin
              </Link>
              <span className="text-slate-300">|</span>
              <Link href="/kesehatan" className="siap-text-accent hover:underline">
                UKS
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10.5px] text-slate-600 block">Santri Pulang</span>
              <strong className="text-base font-bold text-slate-900 tabular-nums">
                {loading ? '...' : izinStats.sedangPulang}
              </strong>
              <span
                className={`text-[10px] block ${
                  izinStats.terlambat > 0 ? 'text-rose-700 font-bold' : 'text-slate-500'
                }`}
              >
                {izinStats.terlambat > 0 ? `${izinStats.terlambat} terlambat` : 'Semua tepat waktu'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200">
              <span className="text-[10.5px] text-rose-800 flex items-center gap-1">
                <HeartPulse className="w-3 h-3 shrink-0" /> Rawat UKS / Rujuk
              </span>
              <strong className="text-base font-bold text-rose-900 tabular-nums">
                {loading ? '...' : kesehatanStats.totalAktif}
              </strong>
              <span
                className={`text-[10px] block ${
                  kesehatanStats.peringatan3Hari > 0
                    ? 'text-rose-700 font-bold'
                    : 'text-rose-700'
                }`}
              >
                {kesehatanStats.peringatan3Hari > 0
                  ? `${kesehatanStats.peringatan3Hari} sakit ≥ 3 hari`
                  : `${kesehatanStats.sembuhBulanIni} sembuh bulan ini`}
              </span>
            </div>
          </div>
        </div>

        {/* 4. KEAMANAN & KETERTIBAN */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">Keamanan &amp; Ketertiban</h3>
            </div>
            <Link
              href="/keamanan"
              className="text-xs font-semibold siap-text-accent hover:underline inline-flex items-center gap-0.5 shrink-0"
            >
              Kelola <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div
              className={`p-2 rounded-xl border ${
                keamananStats.takzirBelumSelesai > 0
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <span className="text-[10px] block">Takzir Aktif</span>
              <strong className="text-sm font-bold tabular-nums">
                {loading ? '...' : keamananStats.takzirBelumSelesai}
              </strong>
            </div>
            <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
              <span className="text-[10px] block">Ambang SP</span>
              <strong className="text-sm font-bold tabular-nums">
                {loading ? '...' : keamananStats.santriAmbangSp}
              </strong>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
              <span className="text-[10px] block">Sitaan</span>
              <strong className="text-sm font-bold tabular-nums">
                {loading ? '...' : keamananStats.barangDisita}
              </strong>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug break-words">
            {keamananStats.topPoinList.length > 0
              ? `Poin tertinggi: ${keamananStats.topPoinList[0].nama} (${keamananStats.topPoinList[0].totalPoin} poin)`
              : `${keamananStats.kasusBulanIni} kasus tercatat bulan ini`}
          </p>
        </div>

        {/* 5. DAPUR & LAUNDRY */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4 text-amber-600 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">Dapur &amp; Laundry</h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold shrink-0">
              <Link href="/dapur" className="siap-text-accent hover:underline">
                Dapur
              </Link>
              <span className="text-slate-300">|</span>
              <Link href="/laundry" className="siap-text-accent hover:underline">
                Laundry
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 min-w-0">
              <span className="text-[10.5px] font-semibold text-amber-900 block">Dapur Hari Ini</span>
              <strong className="text-xs font-bold text-amber-950 block mt-0.5 leading-snug break-words">
                Pagi: {loading ? '...' : dapurStats.pagiLabel}
              </strong>
              <span className="text-[10px] text-amber-800 block mt-0.5 leading-snug break-words">
                Sore: {loading ? '...' : dapurStats.soreLabel}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200">
              <span className="text-[10.5px] font-semibold text-sky-900 flex items-center gap-1">
                <Shirt className="w-3 h-3" /> Laundry ({laundryStats.hariLabel})
              </span>
              <strong className="text-sm font-bold text-sky-950 tabular-nums block mt-0.5">
                {loading
                  ? '...'
                  : laundryStats.isLibur
                  ? 'Libur Jumat'
                  : `${laundryStats.totalPotong} pcs`}
              </strong>
              <span className="text-[10px] text-sky-800 block">
                {laundryStats.isLibur
                  ? 'Buka kembali Sabtu'
                  : `${laundryStats.kamarSetor}/${laundryStats.kamarTerjadwal} kamar setor`}
              </span>
            </div>
          </div>
        </div>

        {/* 6. SARPRAS, KEGIATAN & LAPORAN */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 siap-text-accent shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">Sarpras &amp; Kegiatan</h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold shrink-0">
              <Link href="/sarpras" className="siap-text-accent hover:underline">
                Sarpras
              </Link>
              <span className="text-slate-300">|</span>
              <Link href="/kegiatan" className="siap-text-accent hover:underline">
                Agenda
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 min-w-0">
              <span className="text-[10.5px] text-slate-600 block">Laporan Sarpras</span>
              <strong className="text-sm font-bold text-slate-900 tabular-nums block">
                {loading ? '...' : sarprasStats.menunggu + sarprasStats.diproses} aktif
              </strong>
              <span
                className={`text-[10px] block leading-snug break-words ${
                  sarprasStats.daruratAktif > 0 ? 'text-rose-700 font-bold' : 'text-slate-500'
                }`}
              >
                {sarprasStats.daruratAktif > 0
                  ? `${sarprasStats.daruratAktif} darurat · ${sarprasStats.asetRusak} aset rusak`
                  : `${sarprasStats.asetRusak} aset perlu perbaikan`}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200 min-w-0">
              <span className="text-[10.5px] text-purple-900 flex items-center gap-1">
                <Calendar className="w-3 h-3 shrink-0" /> Agenda Aktif
              </span>
              <strong className="text-sm font-bold text-purple-950 tabular-nums block">
                {loading ? '...' : kegiatanStats.pekanIni} pekan ini
              </strong>
              <span className="text-[10px] text-purple-800 block leading-snug break-words">
                {kegiatanStats.upcomingList[0]
                  ? `${formatHariTanggalIndo(kegiatanStats.upcomingList[0].tanggal)}: ${kegiatanStats.upcomingList[0].judul}`
                  : 'Belum ada agenda dekat'}
              </span>
            </div>
          </div>
          <Link
            href="/laporan"
            className="w-full py-2 px-3 rounded-xl siap-soft-box border text-xs font-bold flex items-center justify-between transition-colors hover:opacity-90"
          >
            <span className="inline-flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 siap-text-accent" />
              Buka Pusat Laporan (PDF &amp; Excel)
            </span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <SarprasQuickReportModal
        isOpen={showSarprasReportModal}
        onClose={() => setShowSarprasReportModal(false)}
        inventarisList={sarprasInventaris}
        existingLaporan={sarprasLaporan}
        onSubmitted={(saved, meta) => {
          setSarprasLaporan((prev) => [saved, ...prev]);
          if (meta.updatedInventaris) {
            setSarprasInventaris((prev) =>
              prev.map((a) =>
                a.id === meta.updatedInventaris?.id ? meta.updatedInventaris : a
              )
            );
          }
          setSarprasStats((prev) => ({
            ...prev,
            menunggu: prev.menunggu + 1,
            daruratAktif: prev.daruratAktif + (saved.urgensi === 'darurat' ? 1 : 0),
            asetRusak: meta.updatedInventaris
              ? sarprasInventaris.filter((i) =>
                  i.id === meta.updatedInventaris?.id
                    ? meta.updatedInventaris.kondisi !== 'baik'
                    : i.kondisi !== 'baik'
                ).length
              : prev.asetRusak,
            recentActive: [saved, ...prev.recentActive].slice(0, 3),
          }));
          setSarprasToast(
            `Laporan ${saved.kode_tiket} (${saved.ruangan}) berhasil dikirim ke Sie Sarpras!`
          );
        }}
      />

      {quickConfigOpen && (
        <QuickMenuConfigModal
          open={quickConfigOpen}
          initialMenuIds={menuCepatIds}
          initialMobileHrefs={mobileNavHrefs}
          saving={savingQuickConfig}
          onClose={() => setQuickConfigOpen(false)}
          onSave={handleSaveQuickConfig}
        />
      )}
    </div>
  );
}