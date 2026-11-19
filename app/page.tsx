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

interface SantriRow {
  id: string;
  nama_lengkap?: string;
  nis?: string;
  status: string;
  kamar?: string;
}

interface TransaksiRow {
  id: string;
  dompet: 'pendaftaran' | 'operasional' | 'kas_pondok' | 'mda';
  tipe: 'masuk' | 'keluar';
  nominal: number;
  tgl_transaksi?: string;
}

interface PengaturanRow {
  id?: number;
  nama_pesantren?: string;
  kota_surat?: string;
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
  emerald: { bg: 'bg-emerald-50', iconText: 'text-emerald-700', border: 'border-emerald-200' },
  blue: { bg: 'bg-sky-50', iconText: 'text-sky-700', border: 'border-sky-200' },
  amber: { bg: 'bg-amber-50', iconText: 'text-amber-700', border: 'border-amber-200' },
  rose: { bg: 'bg-rose-50', iconText: 'text-rose-700', border: 'border-rose-200' },
  indigo: { bg: 'bg-indigo-50', iconText: 'text-indigo-700', border: 'border-indigo-200' },
  teal: { bg: 'bg-teal-50', iconText: 'text-teal-700', border: 'border-teal-200' },
  violet: { bg: 'bg-purple-50', iconText: 'text-purple-700', border: 'border-purple-200' },
  slate: { bg: 'bg-slate-100', iconText: 'text-slate-700', border: 'border-slate-200' },
};

function parseBatasJam(alasan?: string | null): string {
  if (!alasan) return '17:00';
  const marker = '[IZIN_META:';
  const idx = alasan.indexOf(marker);
  if (idx === -1) return '17:00';
  try {
    const raw = alasan.slice(idx + marker.length, alasan.lastIndexOf(']'));
    const parsed = JSON.parse(raw) as { b?: string };
    if (typeof parsed.b === 'string' && /^\d{2}:\d{2}$/.test(parsed.b)) {
      return parsed.b;
    }
  } catch {
    return '17:00';
  }
  return '17:00';
}

function formatRupiah(nominal: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(nominal || 0);
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tahunAjaran, setTahunAjaran] = useState('2026/2027');
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
    totalPersonel: 0,
    saldoOperasional: 0,
    saldoPendaftaran: 0,
    saldoKasPondok: 0,
    saldoMda: 0,
    masukBulanIni: 0,
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

  const [kesehatanStats, setKesehatanStats] = useState({
    dirawatUks: 0,
    dirujuk: 0,
    sembuhBulanIni: 0,
    totalAktif: 0,
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
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayIso = `${yyyy}-${mm}-${dd}`;
    const currentHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const monthPrefix = `${yyyy}-${mm}`;
    const lastDayOfMonth = new Date(yyyy, now.getMonth() + 1, 0).getDate();
    const monthStart = `${monthPrefix}-01`;
    const monthEnd = `${monthPrefix}-${String(lastDayOfMonth).padStart(2, '0')}`;
    const startYear = now.getMonth() + 1 >= 7 ? yyyy : yyyy - 1;

    const namaBulan = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];

    const [
      santriRes,
      transaksiRes,
      pengaturanRes,
      jamaahRes,
      izinRes,
      sakitRes,
      keamananRes,
      sitaRes,
      dapurSesiRes,
      dapurMenuRes,
      dapurKasRes,
      sarprasInvRes,
      sarprasLapRes,
      kegiatanListRes,
      laundryJadwalRes,
      laundryCatatanRes,
    ] = await Promise.all([
      supabase.from('santri').select('id, nama_lengkap, nis, status, kamar'),
      supabase.from('keuangan_transaksi').select('id, dompet, tipe, nominal, tgl_transaksi'),
      supabase.from('pengaturan_aplikasi').select('*').limit(1).maybeSingle(),
      supabase
        .from('absen_jamaah')
        .select('id, tgl, santri_id, waktu_sholat, status')
        .gte('tgl', monthStart)
        .lte('tgl', monthEnd),
      supabase
        .from('izin_pulang')
        .select('id, santri_id, jenis_izin, tgl_pulang, tgl_rencana_kembali, alasan, status')
        .eq('status', 'disetujui'),
      supabase.from('santri_sakit').select('id, santri_id, tgl_sakit, tgl_sembuh, status'),
      supabase.from('keamanan_pelanggaran').select('id, santri_id, tanggal, poin, status_takzir'),
      supabase.from('keamanan_sita_barang').select('id, status'),
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
    const transaksiList = (transaksiRes.data || []) as TransaksiRow[];
    const setting = (pengaturanRes.data || {}) as PengaturanRow;
    const localExt = readExtendedLocal();
    const mergedAturan = mergeAturanOperasional(
      setting.aturan_operasional ?? localExt?.aturan_operasional
    );
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

    let saldoPendaftaran = Number(setting.saldo_awal_pendaftaran || 0);
    let saldoOperasional = Number(setting.saldo_awal_operasional || 0);
    let saldoKasPondok = Number(setting.saldo_awal_kas_pondok || 0);
    let saldoMda = Number(setting.saldo_awal_mda || 0);
    let masukBulanIni = 0;

    for (const tx of transaksiList) {
      const nominal = Number(tx.nominal || 0);
      const signed = tx.tipe === 'masuk' ? nominal : -nominal;
      if (tx.dompet === 'pendaftaran') saldoPendaftaran += signed;
      else if (tx.dompet === 'operasional') saldoOperasional += signed;
      else if (tx.dompet === 'kas_pondok') saldoKasPondok += signed;
      else if (tx.dompet === 'mda') saldoMda += signed;

      if (tx.tipe === 'masuk' && (tx.tgl_transaksi || '').startsWith(monthPrefix)) {
        masukBulanIni += nominal;
      }
    }

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

      mTotal += 1;
      if (row.tgl) mDaysSet.add(row.tgl);
      if (row.status === 'hadir') mHadir += 1;
      else if (row.status === 'sakit') mSakit += 1;
      else if (row.status === 'izin') mIzin += 1;
      else if (row.status === 'alpha') mAlpha += 1;

      if (row.tgl === todayIso) {
        jTotal += 1;
        if (row.status === 'hadir') jHadir += 1;
        else if (row.status === 'sakit') jSakit += 1;
        else if (row.status === 'izin') jIzin += 1;
        else if (row.status === 'alpha') jAlpha += 1;

        if (row.waktu_sholat === 'subuh') subuhCount += 1;
        else if (row.waktu_sholat === 'dzuhur') dzuhurCount += 1;
        else if (row.waktu_sholat === 'ashar') asharCount += 1;
        else if (row.waktu_sholat === 'maghrib') maghribCount += 1;
        else if (row.waktu_sholat === 'isya') isyaCount += 1;
      }
    }

    let izinTidakMenginap = 0;
    let izinMenginap = 0;
    let izinTerlambat = 0;

    for (const row of izinActiveList) {
      if (row.jenis_izin === 'tidak_menginap') izinTidakMenginap += 1;
      else izinMenginap += 1;

      const batasJam = parseBatasJam(row.alasan);
      const isLate =
        todayIso > row.tgl_rencana_kembali ||
        (row.jenis_izin === 'tidak_menginap' &&
          todayIso === row.tgl_rencana_kembali &&
          currentHm > batasJam);
      if (isLate) izinTerlambat += 1;
    }

    let dirawatUks = 0;
    let dirujuk = 0;
    let sembuhBulanIni = 0;

    for (const row of sakitList) {
      if (row.status === 'rawat_uks') dirawatUks += 1;
      else if (row.status === 'dirujuk') dirujuk += 1;
      else if (row.status === 'sembuh') {
        const tglRef = row.tgl_sembuh || row.tgl_sakit || '';
        if (tglRef.startsWith(monthPrefix)) sembuhBulanIni += 1;
      }
    }

    let takzirBelumSelesai = 0;
    let kasusBulanIni = 0;
    const poinMap = new Map<string, { totalPoin: number; kasusCount: number }>();
    const santriById = new Map(santriList.map((s) => [s.id, s]));

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
      if (r.status === 'menunggu') {
        srpMenunggu += 1;
        srpActiveList.push(r);
      } else if (r.status === 'diproses') {
        srpDiproses += 1;
        srpActiveList.push(r);
      } else if (r.status === 'selesai') {
        const ref = r.tgl_selesai || r.tanggal_lapor || '';
        if (ref.startsWith(monthPrefix)) srpSelesaiBulanIni += 1;
      }
      if (r.status !== 'selesai' && r.urgensi === 'darurat') srpDaruratAktif += 1;
    }

    srpActiveList.sort((a, b) => (b.tanggal_lapor || '').localeCompare(a.tanggal_lapor || ''));
    const srpAsetRusak = sarprasInvList.filter((i) => i.kondisi !== 'baik').length;

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
      bulanLabel: `${namaBulan[now.getMonth()]} ${yyyy}`,
      menuCepatIds: mergedAturan.menu_cepat_ids,
      koreksiHijriyah: mergedAturan.jadwal.koreksi_hijriyah,
      rawPengaturanDb: setting,
      stats: {
        santriAktif,
        santriNdalem,
        santriBeasiswa,
        totalPersonel: santriList.length,
        saldoOperasional,
        saldoPendaftaran,
        saldoKasPondok,
        saldoMda,
        masukBulanIni,
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
      kesehatanStats: {
        dirawatUks,
        dirujuk,
        sembuhBulanIni,
        totalAktif: dirawatUks + dirujuk,
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
  }, []);

  const todayCalendarInfo = useMemo(() => {
    const ref = nowClock || new Date('2026-11-18T08:00:00Z');
    const todayIso = getWibTodayIso(ref);
    const masehiPasaran = formatHariPasaranIndo(todayIso);
    const hijri = getHijriDate(todayIso, koreksiHijriyah);
    const sholat = computeJadwalSholatBululawang(todayIso);
    const countdown = getNextPrayerCountdown(ref, sholat);
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
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 rounded-2xl p-4 sm:p-5 text-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-emerald-200">
            <span className="px-2.5 py-0.5 bg-emerald-700/70 rounded-md border border-emerald-600/50">
              TA {tahunAjaran}
            </span>
            <span className="truncate">{stats.namaPesantren}</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-bold mt-1.5 tracking-tight">
            Beranda Pengurus SIAP An-Nur 1
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="min-h-[38px] px-3 py-1.5 bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 text-xs font-semibold rounded-xl border border-emerald-600/60 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>
          <button
            type="button"
            onClick={() => setShowSarprasReportModal(true)}
            className="min-h-[38px] px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl border border-emerald-500/60 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5" />
            Lapor Sarpras
          </button>
          <Link
            href="/santri"
            className="flex-1 sm:flex-none min-h-[38px] px-3.5 py-1.5 bg-white text-emerald-900 text-xs font-bold rounded-xl shadow-xs hover:bg-emerald-50 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
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
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-emerald-900 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{quickToast}</span>
        </div>
      )}

      {/* BANNER KALENDER MASEHI / HIJRIYAH & JADWAL SHOLAT BULULAWANG */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>Bululawang, Kab. Malang (WIB)</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-900">
              {todayCalendarInfo.masehiPasaran}
            </p>
            <p className="text-xs font-semibold text-emerald-800">
              {todayCalendarInfo.hijri.formatted} H
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 bg-emerald-50/80 border border-emerald-200 rounded-xl px-3.5 py-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                Menuju {todayCalendarInfo.countdown.nextName}
              </span>
              <strong className="text-base sm:text-lg font-extrabold text-emerald-950 tabular-nums">
                {todayCalendarInfo.countdown.nextTime} WIB
              </strong>
            </div>
            <div className="text-right border-l border-emerald-200 pl-3">
              <span className="text-[10px] font-semibold text-emerald-700 block">Hitung Mundur</span>
              <span className="font-mono text-xs sm:text-sm font-bold text-emerald-900 tabular-nums">
                {todayCalendarInfo.countdown.remainingFormatted}
              </span>
            </div>
            <Link
              href="/kalender"
              className="p-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shrink-0 transition-colors"
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
                    ? 'bg-emerald-700 border-emerald-700 text-white font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <span className={`block text-[10px] ${isNext ? 'text-emerald-100' : 'text-slate-500'}`}>
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
            <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
            <h2 className="font-bold text-sm text-slate-900">Menu Cepat Divisi</h2>
          </div>
          <button
            type="button"
            onClick={() => setQuickConfigOpen(true)}
            className="min-h-[34px] px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 hover:text-emerald-900 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
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
                className="group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/40 transition-all text-center"
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
              {stats.santriNdalem} Ndalem &bull; {stats.santriBeasiswa} Beasiswa
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">Kas Operasional</span>
            <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="mt-2">
            <strong className="text-sm sm:text-lg font-extrabold text-emerald-800 tabular-nums block leading-snug">
              {loading ? '...' : formatRupiah(stats.saldoOperasional)}
            </strong>
            <span className="text-[10.5px] text-slate-500 block mt-0.5 tabular-nums">
              Masuk {bulanLabel}: {formatRupiah(stats.masukBulanIni)}
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">Total 4 Dompet</span>
            <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0" />
          </div>
          <div className="mt-2">
            <strong className="text-sm sm:text-lg font-extrabold text-slate-900 tabular-nums block leading-snug">
              {loading ? '...' : formatRupiah(total4Dompet)}
            </strong>
            <span className="text-[10.5px] text-slate-500 block mt-0.5">
              PSB, Ops, Kas &amp; MDA
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">Jamaah {bulanLabel}</span>
            <CalendarCheck className="w-4 h-4 text-emerald-600 shrink-0" />
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

      {/* TOAST SARPRAS JIKA BARU KIRIM LAPORAN */}
      {sarprasToast && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{sarprasToast}</span>
          </div>
          <Link href="/sarpras" className="font-bold text-emerald-700 hover:underline whitespace-nowrap shrink-0">
            Lihat Antrean &rarr;
          </Link>
        </div>
      )}

      {/* RINGKASAN DIVISI RINGKAS & INFORMATIF */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* 1. KEUANGAN 4 DOMPET */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-700 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">Keuangan 4 Dompet</h3>
            </div>
            <Link
              href="/keuangan"
              className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-0.5 shrink-0"
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
            <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <span className="text-[10.5px] font-semibold text-emerald-900 block">2. Operasional</span>
              <strong className="text-xs sm:text-sm font-bold text-emerald-950 tabular-nums">
                {loading ? '...' : formatRupiah(stats.saldoOperasional)}
              </strong>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <span className="text-[10.5px] font-semibold text-amber-900 block">3. Kas Lainnya</span>
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
              className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-0.5 shrink-0"
            >
              Input <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] text-emerald-800 block">Hadir</span>
              <strong className="text-sm font-bold text-emerald-950 tabular-nums">
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
            Bulan ini: <strong>{jamaahMonthly.hariTercatat} hari</strong> tercatat ({jamaahMonthly.alpha} alpha total)
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
              <Link href="/perizinan" className="text-emerald-700 hover:underline">
                Izin
              </Link>
              <span className="text-slate-300">|</span>
              <Link href="/kesehatan" className="text-emerald-700 hover:underline">
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
              <span className="text-[10.5px] text-rose-800 block flex items-center gap-1">
                <HeartPulse className="w-3 h-3" /> Rawat UKS / Rujuk
              </span>
              <strong className="text-base font-bold text-rose-900 tabular-nums">
                {loading ? '...' : kesehatanStats.totalAktif}
              </strong>
              <span className="text-[10px] text-rose-700 block">
                {kesehatanStats.sembuhBulanIni} sembuh bulan ini
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
              className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-0.5 shrink-0"
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
          <p className="text-[11px] text-slate-500 truncate">
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
              <Link href="/dapur" className="text-emerald-700 hover:underline">
                Dapur
              </Link>
              <span className="text-slate-300">|</span>
              <Link href="/laundry" className="text-emerald-700 hover:underline">
                Laundry
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <span className="text-[10.5px] font-semibold text-amber-900 block">Dapur Hari Ini</span>
              <strong className="text-xs font-bold text-amber-950 block mt-0.5 truncate">
                Pagi: {loading ? '...' : dapurStats.pagiLabel}
              </strong>
              <span className="text-[10px] text-amber-800 block truncate">
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
              <Package className="w-4 h-4 text-emerald-700 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">Sarpras &amp; Kegiatan</h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold shrink-0">
              <Link href="/sarpras" className="text-emerald-700 hover:underline">
                Sarpras
              </Link>
              <span className="text-slate-300">|</span>
              <Link href="/kegiatan" className="text-emerald-700 hover:underline">
                Agenda
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10.5px] text-slate-600 block">Tiket Sarpras</span>
              <strong className="text-sm font-bold text-slate-900 tabular-nums block">
                {loading ? '...' : sarprasStats.menunggu + sarprasStats.diproses} aktif
              </strong>
              <span className="text-[10px] text-slate-500 block">
                {sarprasStats.asetRusak} aset perlu perbaikan
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200">
              <span className="text-[10.5px] text-purple-900 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Agenda Aktif
              </span>
              <strong className="text-sm font-bold text-purple-950 tabular-nums block">
                {loading ? '...' : kegiatanStats.pekanIni} pekan ini
              </strong>
              <span className="text-[10px] text-purple-800 block truncate">
                {kegiatanStats.upcomingList[0]
                  ? `${formatHariTanggalIndo(kegiatanStats.upcomingList[0].tanggal)}: ${kegiatanStats.upcomingList[0].judul}`
                  : 'Belum ada agenda dekat'}
              </span>
            </div>
          </div>
          <Link
            href="/laporan"
            className="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between transition-colors"
          >
            <span className="inline-flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
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