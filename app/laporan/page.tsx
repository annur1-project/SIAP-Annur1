'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileSpreadsheet,
  Layers,
  Printer,
  RefreshCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import LaporanDocument from '@/components/LaporanDocument';
import { TransparencyBanner, useAuth } from '@/lib/auth';
import { getTahunAjaranForDate } from '@/lib/pengaturan';
import { supabase } from '@/lib/supabase';
import {
  addDaysIso,
  buildAllDivisionReports,
  computePeriodWindow,
  exportLaporanToExcel,
  fetchAllLaporanRawData,
  formatRupiah,
  getLocalTodayStr,
  getNearestFridayIso,
  LAPORAN_DIVISIONS,
  type AllLaporanRawData,
  type LaporanDivisionKey,
  type LaporanScope,
  type PeriodeMode,
} from '@/lib/laporan';

type ExtraDivisionKey = 'kebersihan' | 'koperasi' | 'psb';
type ExtendedDivisionKey = LaporanDivisionKey | ExtraDivisionKey;
type ExtendedScope = 'gabungan' | ExtendedDivisionKey;

interface DivisionMeta {
  key: ExtendedDivisionKey;
  shortLabel: string;
  label: string;
}

const EXTRA_DIVISIONS: DivisionMeta[] = [
  { key: 'kebersihan', shortLabel: 'Kebersihan & Piket', label: 'Kebersihan & Piket Pondok' },
  { key: 'koperasi', shortLabel: 'Koperasi Pondok', label: 'Koperasi Pondok' },
  { key: 'psb', shortLabel: 'PSB (Pendaftaran)', label: 'Pendaftaran Santri Baru (PSB)' },
];

const BASE_DIV_KEYS: LaporanDivisionKey[] = LAPORAN_DIVISIONS.map((d) => d.key);

const ALL_DIVISIONS: DivisionMeta[] = [
  ...LAPORAN_DIVISIONS.map((d) => ({
    key: d.key as ExtendedDivisionKey,
    shortLabel: d.shortLabel,
    label: (d as { label?: string }).label || d.shortLabel,
  })),
  ...EXTRA_DIVISIONS.filter(
    (ex) => !LAPORAN_DIVISIONS.some((base) => (base.key as string) === ex.key)
  ),
];

const ALL_DIV_KEYS: ExtendedDivisionKey[] = ALL_DIVISIONS.map((d) => d.key);

interface ExtraRawData {
  kebersihanRows: Array<Record<string, unknown>>;
  koperasiTransaksiRows: Array<Record<string, unknown>>;
  koperasiProdukRows: Array<Record<string, unknown>>;
  psbRows: Array<Record<string, unknown>>;
  kegiatanRows: Array<Record<string, unknown>>;
  perizinanRows: Array<Record<string, unknown>>;
  santriRows: Array<Record<string, unknown>>;
  pembayaranDetailRows: Array<Record<string, unknown>>;
  masterPembayaranRows: Array<Record<string, unknown>>;
  masterRiwayatRows: Array<Record<string, unknown>>;
  keuanganTransaksiRows: Array<Record<string, unknown>>;
}

interface KegiatanLampiranItem {
  id: string;
  judul: string;
  tanggal: string;
  jamMulai: string;
  lokasi: string;
  notulensi: string;
  urls: string[];
}

interface RawJabatanPersonalia {
  divisi: string;
  nama_jabatan: string;
  urutan_struktur: number;
}

interface RawPengurusPersonalia {
  id: string;
  nama_lengkap: string;
  status: string;
  masa_khidmat: string;
  jabatan_list: RawJabatanPersonalia[];
}

interface PengaturanApprovalInfo {
  nama_pesantren: string;
  kota_surat: string;
  tahun_ajaran_aktif: string;
  nama_pengasuh: string;
  nama_kepala_pondok: string;
  nama_sekretaris: string;
  ttd_pengasuh_url: string | null;
  ttd_kepala_pondok_url: string | null;
  ttd_sekretaris_url: string | null;
  stempel_url: string | null;
}

const DEWAN_HARIAN_ORDER = [
  'Kepala Pondok',
  'Wakil Kepala Pondok',
  'Sekretaris',
  'Wakil Sekretaris',
  'Bendahara',
  'Wakil Bendahara',
] as const;

const PLENO_DIVISI_ORDER: Array<{
  letter: string;
  label: string;
  aliases: string[];
}> = [
  { letter: 'A', label: 'Sie Kegiatan', aliases: ['sie kegiatan'] },
  { letter: 'B', label: 'Sie Keamanan', aliases: ['sie keamanan'] },
  { letter: 'C', label: 'Sie Kesehatan', aliases: ['sie kesehatan'] },
  { letter: 'D', label: 'Sie Kebersihan', aliases: ['sie kebersihan'] },
  { letter: 'E', label: 'Sie Sarpras', aliases: ['sie sarpras'] },
  { letter: 'F', label: 'Sie Dapur', aliases: ['sie dapur'] },
  { letter: 'G', label: 'Sie Koperasi', aliases: ['sie koperasi', 'sie koprasi'] },
  { letter: 'H', label: 'Sie Laundry', aliases: ['sie laundry'] },
  { letter: 'I', label: 'Operator EMIS', aliases: ['operator emis'] },
  { letter: 'J', label: 'Guru Bantu', aliases: ['guru bantu'] },
  { letter: 'K', label: 'Musyrif Kamar', aliases: ['musyrif kamar'] },
];

const DEFAULT_KAMAR_ORDER = [
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'A8',
  'A9',
  'A10',
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'Tahfidz',
  'Al-Fachriyah 1 (VIP)',
  'Al-Fachriyah 2 (VIP)',
  'Al-Fachriyah 3 (VIP)',
  'Al-Fachriyah 4 (VIP)',
];

function normalizeDivisiName(raw: string): string {
  const trimmed = (raw || '').trim();
  if (trimmed === 'Pimpinan & Harian') return 'Dewan Harian';
  if (trimmed === 'Pengasuh') return 'Pengasuh Pondok';
  return trimmed;
}

function isExcludedTopLeadership(divisi: string, namaJabatan: string): boolean {
  const d = normalizeDivisiName(divisi).toLowerCase();
  const j = (namaJabatan || '').trim().toLowerCase();
  const matchesExcluded = (val: string) =>
    val === 'pengasuh pondok' ||
    val === 'pengasuh' ||
    val.startsWith('dewan pengasuh') ||
    val.includes('dzurriyah') ||
    val === 'direktur pendidikan';
  return matchesExcluded(d) || matchesExcluded(j);
}

function getRoleRank(namaJabatan: string, urutanStruktur: number): number {
  const lower = (namaJabatan || '').trim().toLowerCase();
  if (lower.includes('wakil') && lower.includes('koordinator')) return 2;
  if (lower.includes('koordinator')) return 1;
  if (lower.includes('anggota')) return 3;
  if (urutanStruktur === 1) return 1;
  if (urutanStruktur === 2) return 2;
  return 3;
}

function formatCleanSectionRole(divisi: string, namaJabatan: string, urutanStruktur: number): string {
  const raw = (namaJabatan || '').trim();
  const div = (divisi || '').trim();
  const rank = getRoleRank(raw, urutanStruktur);
  if (!raw || raw.toLowerCase() === div.toLowerCase()) {
    return rank === 1 ? 'Koordinator' : rank === 2 ? 'Wakil Koordinator' : 'Anggota';
  }
  const escapedDiv = div.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = raw
    .replace(new RegExp(`\\s*${escapedDiv}$`, 'i'), '')
    .replace(/\s*(Sie\s+Koperasi|Sie\s+Koprasi|Operator\s+EMIS)$/i, '')
    .trim();
  return stripped || raw;
}

function formatTanggalSuratIndo(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '-';
  const bulan = [
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
  const [y, m, d] = iso.split('-');
  const mIdx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${Number(d)} ${bulan[mIdx]} ${y}`;
}

function parseCleanKeperluan(raw: string): string {
  const txt = (raw || '').trim();
  if (!txt || txt === '-') return '-';
  const stripped = txt.replace(/\[IZIN_META:[\s\S]*?\]/gi, '').replace(/\s+/g, ' ').trim();
  if (stripped) return stripped;
  const metaMatch = txt.match(/\[IZIN_META:(\{[\s\S]*?\})\]/i);
  if (metaMatch && metaMatch[1]) {
    try {
      const parsed = JSON.parse(metaMatch[1]) as Record<string, unknown>;
      for (const k of ['keperluan', 'alasan', 'tujuan', 'keterangan', 'jenis_izin']) {
        const val = parsed[k];
        if (typeof val === 'string' && val.trim()) {
          const innerClean = val.replace(/\[IZIN_META:[\s\S]*?\]/gi, '').trim();
          if (innerClean) return innerClean;
        }
      }
    } catch {
      // ignore invalid meta JSON
    }
  }
  return '-';
}

function formatPsbStatusLabel(raw: string): string {
  const cleaned = (raw || '').trim();
  if (!cleaned) return 'Terdaftar';
  const key = cleaned.toLowerCase().replace(/[\s-]+/g, '_');
  const map: Record<string, string> = {
    dp_terverifikasi: 'DP Terverifikasi',
    menunggu_verifikasi: 'Menunggu Verifikasi',
    menunggu_dp: 'Menunggu DP',
    diterima_aktif: 'Diterima Aktif',
    ditolak: 'Ditolak',
    terverifikasi: 'Terverifikasi',
    lunas: 'Lunas',
    terdaftar: 'Terdaftar',
    aktif: 'Aktif',
    batal: 'Dibatalkan',
    dibatalkan: 'Dibatalkan',
  };
  if (map[key]) return map[key];
  if (cleaned.includes('_')) {
    const acronyms = new Set(['dp', 'psb', 'vip', 'wa']);
    return key
      .split('_')
      .filter(Boolean)
      .map((w) => (acronyms.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
  }
  return cleaned;
}

function isExtraKey(key: string): key is ExtraDivisionKey {
  return key === 'kebersihan' || key === 'koperasi' || key === 'psb';
}

async function fetchSafeTable(table: string): Promise<Array<Record<string, unknown>>> {
  try {
    const { data, error } = await supabase.from(table).select('*');
    if (!error && Array.isArray(data)) {
      return data as Array<Record<string, unknown>>;
    }
  } catch {
    // ignore missing table or offline error
  }
  return [];
}

function readLocalFallbackRows(keyHints: string[]): Array<Record<string, unknown>> {
  if (typeof window === 'undefined') return [];
  const collected: Array<Record<string, unknown>> = [];
  const seenIds = new Set<string>();
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const storageKey = window.localStorage.key(i) || '';
      const lower = storageKey.toLowerCase();
      if (!keyHints.some((hint) => lower.includes(hint))) continue;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw || !raw.trim().startsWith('[')) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const rec = item as Record<string, unknown>;
          const id = String(rec.id || '');
          if (id && seenIds.has(id)) continue;
          if (id) seenIds.add(id);
          collected.push(rec);
        }
      }
    }
  } catch {
    // ignore invalid localStorage data
  }
  return collected;
}

function mergeUniqueRows(
  groups: Array<Array<Record<string, unknown>>>,
  fallbackHints: string[]
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const grp of groups) {
    for (const row of grp) {
      const id = String(row.id || '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(row);
    }
  }
  if (out.length === 0) {
    return readLocalFallbackRows(fallbackHints);
  }
  return out;
}

function extractRowDateIso(row: Record<string, unknown>): string {
  const candidates = [
    row.tanggal,
    row.tanggal_transaksi,
    row.tanggal_piket,
    row.tanggal_daftar,
    row.tgl,
    row.created_at,
    row.updated_at,
  ];
  for (const val of candidates) {
    if (typeof val === 'string') {
      const m = val.trim().match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
    }
  }
  return '';
}

function extractNumericField(row: Record<string, unknown>, fields: string[]): number {
  for (const f of fields) {
    const val = row[f];
    if (typeof val === 'number' && !Number.isNaN(val)) return val;
    if (typeof val === 'string' && val.trim() !== '') {
      const parsed = Number(val.replace(/[^\d.-]/g, ''));
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return 0;
}

function extractTextField(row: Record<string, unknown>, fields: string[], fallback = '-'): string {
  for (const f of fields) {
    const val = row[f];
    if (typeof val === 'string' && val.trim() !== '') return val.trim();
    if (typeof val === 'number' && !Number.isNaN(val)) return String(val);
  }
  return fallback;
}

function formatIsoDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function computeActiveRangeDates(
  mode: PeriodeMode,
  anchorDate: string,
  monthStr: string,
  rangeStart: string,
  rangeEnd: string,
  todayStr: string
): { start: string; end: string; prevStart: string; prevEnd: string } {
  const safeToday = todayStr || '2026-01-01';
  if (mode === 'mingguan') {
    const end = anchorDate || getNearestFridayIso(safeToday);
    const start = addDaysIso(end, -6);
    const prevEnd = addDaysIso(start, -1);
    const prevStart = addDaysIso(prevEnd, -6);
    return { start, end, prevStart, prevEnd };
  }
  if (mode === 'bulanan') {
    const ym = monthStr || safeToday.slice(0, 7);
    const [yStr, mStr] = ym.split('-');
    const y = Number(yStr) || Number(safeToday.slice(0, 4));
    const m = Number(mStr) || Number(safeToday.slice(5, 7));
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
    const end = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const prevDate = new Date(y, m - 2, 1);
    const py = prevDate.getFullYear();
    const pm = prevDate.getMonth() + 1;
    const pLast = new Date(py, pm, 0).getDate();
    const prevStart = `${String(py).padStart(4, '0')}-${String(pm).padStart(2, '0')}-01`;
    const prevEnd = `${String(py).padStart(4, '0')}-${String(pm).padStart(2, '0')}-${String(pLast).padStart(2, '0')}`;
    return { start, end, prevStart, prevEnd };
  }
  const s = rangeStart || addDaysIso(safeToday, -6);
  const e = rangeEnd || safeToday;
  const start = s <= e ? s : e;
  const end = s <= e ? e : s;
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  const spanDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
  const prevEnd = addDaysIso(start, -1);
  const prevStart = addDaysIso(prevEnd, -(spanDays - 1));
  return { start, end, prevStart, prevEnd };
}

function extractIsoFromFields(row: Record<string, unknown>, fields: string[]): string {
  for (const f of fields) {
    const val = row[f];
    if (typeof val === 'string') {
      const m = val.trim().match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
    }
  }
  return '';
}

function formatDdMmDate(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
  const [, m, d] = iso.split('-');
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}`;
}

const SHORT_ID_MONTH_MAP: Record<string, string> = {
  jan: '01',
  januari: '01',
  feb: '02',
  februari: '02',
  mar: '03',
  maret: '03',
  apr: '04',
  april: '04',
  mei: '05',
  jun: '06',
  juni: '06',
  jul: '07',
  juli: '07',
  agu: '08',
  ags: '08',
  agustus: '08',
  sep: '09',
  sept: '09',
  september: '09',
  okt: '10',
  oktober: '10',
  nov: '11',
  november: '11',
  des: '12',
  desember: '12',
};

function compactChartDateLabel(raw: string, isLastInSixSeries: boolean): string {
  const txt = (raw || '').replace(/\s+/g, ' ').trim();
  if (!txt) return txt;
  if (/^kini$/i.test(txt)) return 'Kini';

  const ddMmMatches = Array.from(txt.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g));
  const idMonthMatches = Array.from(
    txt.toLowerCase().matchAll(
      /\b(\d{1,2})\s+(jan|januari|feb|februari|mar|maret|apr|april|mei|jun|juni|jul|juli|agu|ags|agustus|sep|sept|september|okt|oktober|nov|november|des|desember)\b/g
    )
  );
  const isWeeklyToken =
    ddMmMatches.length > 0 ||
    idMonthMatches.length > 0 ||
    /\b(pekan|minggu)\b/i.test(txt);

  if (isLastInSixSeries && isWeeklyToken) {
    return 'Kini';
  }

  if (ddMmMatches.length >= 2) {
    const last = ddMmMatches[ddMmMatches.length - 1];
    return `${last[1].padStart(2, '0')}/${last[2].padStart(2, '0')}`;
  }
  if (ddMmMatches.length === 1) {
    const only = ddMmMatches[0];
    return `${only[1].padStart(2, '0')}/${only[2].padStart(2, '0')}`;
  }
  if (idMonthMatches.length > 0) {
    const last = idMonthMatches[idMonthMatches.length - 1];
    const mm = SHORT_ID_MONTH_MAP[last[2]] || '01';
    return `${last[1].padStart(2, '0')}/${mm}`;
  }
  return txt;
}

function buildSixWeekWindows(anchorEndIso: string): Array<{
  label: string;
  shortLabel: string;
  start: string;
  end: string;
}> {
  const safeEnd =
    anchorEndIso && /^\d{4}-\d{2}-\d{2}$/.test(anchorEndIso) ? anchorEndIso : '2026-01-01';
  const buckets: Array<{ label: string; shortLabel: string; start: string; end: string }> = [];
  for (let i = 5; i >= 0; i -= 1) {
    const wEnd = addDaysIso(safeEnd, -i * 7);
    const wStart = addDaysIso(wEnd, -6);
    buckets.push({
      label: `Pekan ${6 - i}`,
      shortLabel: i === 0 ? 'Kini' : formatDdMmDate(wEnd),
      start: wStart,
      end: wEnd,
    });
  }
  return buckets;
}

function formatCompactRupiah(val: number): string {
  if (!val) return 'Rp 0';
  if (val >= 1_000_000) {
    return `Rp ${(val / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')} jt`;
  }
  if (val >= 1_000) {
    return `Rp ${Math.round(val / 1_000)} rb`;
  }
  return formatRupiah(val);
}

export default function PusatLaporanPage() {
  const { canEditModule, canViewBisyaroh } = useAuth();
  const canEditLaporan = canEditModule('laporan');
  const [todayStr, setTodayStr] = useState<string>('');
  const [mode, setMode] = useState<PeriodeMode>('mingguan');
  const [anchorDate, setAnchorDate] = useState<string>('');
  const [monthStr, setMonthStr] = useState<string>('');
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');

  const [scope, setScope] = useState<ExtendedScope>('gabungan');
  const [selectedDivisions, setSelectedDivisions] = useState<ExtendedDivisionKey[]>(ALL_DIV_KEYS);
  const [showCoverAndApproval, setShowCoverAndApproval] = useState<boolean>(true);
  const [showNotaLampiran, setShowNotaLampiran] = useState<boolean>(true);
  const [useDigitalSignature, setUseDigitalSignature] = useState<boolean>(true);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState<boolean>(false);

  const [rawData, setRawData] = useState<AllLaporanRawData | null>(null);
  const [extraRaw, setExtraRaw] = useState<ExtraRawData>({
    kebersihanRows: [],
    koperasiTransaksiRows: [],
    koperasiProdukRows: [],
    psbRows: [],
    kegiatanRows: [],
    perizinanRows: [],
    santriRows: [],
    pembayaranDetailRows: [],
    masterPembayaranRows: [],
    masterRiwayatRows: [],
    keuanganTransaksiRows: [],
  });
  const [pengurusRows, setPengurusRows] = useState<RawPengurusPersonalia[]>([]);
  const [kamarOrder, setKamarOrder] = useState<string[]>(DEFAULT_KAMAR_ORDER);
  const [pengaturanApproval, setPengaturanApproval] = useState<PengaturanApprovalInfo>({
    nama_pesantren: 'Pondok Pesantren An-Nur 1 Bululawang',
    kota_surat: 'Bululawang, Malang',
    tahun_ajaran_aktif: '',
    nama_pengasuh: 'Dr. KH. A. Fahrur Rozi',
    nama_kepala_pondok: 'Ust. M. Fajar Wahyudi',
    nama_sekretaris: 'Ust. Moh. Sayid Ali',
    ttd_pengasuh_url: null,
    ttd_kepala_pondok_url: null,
    ttd_sekretaris_url: null,
    stempel_url: null,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const docWrapperRef = useRef<HTMLDivElement>(null);
  const personaliaSourceRef = useRef<HTMLDivElement>(null);
  const approvalSourceRef = useRef<HTMLDivElement>(null);
  const tunggakanTableSourceRef = useRef<HTMLDivElement>(null);
  const perizinanTableSourceRef = useRef<HTMLDivElement>(null);
  const kegiatanFotoSourceRef = useRef<HTMLDivElement>(null);
  const extraSourceRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      setErrorMsg('');
      const [
        data,
        kebLog,
        kebPiket,
        kebTugas,
        kebChecklist,
        kebNilai,
        kopTrx,
        kopKas,
        kopJual,
        kopKulaan,
        kopProduk,
        kopBarang,
        psb1,
        psb2,
        psb3,
        settingRows,
        amanRows,
        jabatanRows,
        santriKamarRows,
        kegiatanAgendaRows,
        perizinan1,
        perizinan2,
        perizinan3,
        pembayaranDetailRows,
        masterPembayaranRows,
        masterRiwayatRows,
        keuanganTransaksiRows,
      ] = await Promise.all([
        fetchAllLaporanRawData({ canViewBisyaroh }),
        fetchSafeTable('kebersihan_log'),
        fetchSafeTable('kebersihan_piket'),
        fetchSafeTable('kebersihan_tugas'),
        fetchSafeTable('kebersihan_checklist'),
        fetchSafeTable('kebersihan_penilaian'),
        fetchSafeTable('koperasi_transaksi'),
        fetchSafeTable('koperasi_kas'),
        fetchSafeTable('koperasi_penjualan'),
        fetchSafeTable('koperasi_kulaan'),
        fetchSafeTable('koperasi_produk'),
        fetchSafeTable('koperasi_barang'),
        fetchSafeTable('psb_pendaftaran'),
        fetchSafeTable('pendaftaran_santri'),
        fetchSafeTable('calon_santri'),
        fetchSafeTable('pengaturan_aplikasi'),
        fetchSafeTable('v_pengurus_aman'),
        fetchSafeTable('pengurus_jabatan'),
        fetchSafeTable('santri'),
        fetchSafeTable('kegiatan_agenda'),
        fetchSafeTable('perizinan'),
        fetchSafeTable('perizinan_pulang'),
        fetchSafeTable('izin_pulang'),
        fetchSafeTable('pembayaran_santri_detail'),
        fetchSafeTable('master_pembayaran'),
        fetchSafeTable('master_pembayaran_riwayat'),
        fetchSafeTable('keuangan_transaksi'),
      ]);
      setRawData(data);
      setExtraRaw({
        kebersihanRows: mergeUniqueRows(
          [kebLog, kebPiket, kebTugas, kebChecklist, kebNilai],
          ['kebersihan', 'piket']
        ),
        koperasiTransaksiRows: mergeUniqueRows(
          [kopTrx, kopKas, kopJual, kopKulaan],
          ['koperasi_transaksi', 'koperasi_kas', 'siap_koperasi']
        ),
        koperasiProdukRows: mergeUniqueRows(
          [kopProduk, kopBarang],
          ['koperasi_produk', 'koperasi_barang']
        ),
        psbRows: mergeUniqueRows(
          [psb1, psb2, psb3],
          ['psb', 'pendaftaran']
        ),
        kegiatanRows: mergeUniqueRows(
          [kegiatanAgendaRows],
          ['kegiatan_agenda', 'siap_kegiatan']
        ),
        perizinanRows: mergeUniqueRows(
          [perizinan1, perizinan2, perizinan3],
          ['perizinan', 'izin_pulang']
        ),
        santriRows: santriKamarRows,
        pembayaranDetailRows,
        masterPembayaranRows,
        masterRiwayatRows,
        keuanganTransaksiRows,
      });

      const settingRow =
        settingRows.find((r) => Number(r.id) === 1) || settingRows[0] || null;
      if (settingRow) {
        setPengaturanApproval((prev) => ({
          nama_pesantren: String(settingRow.nama_pesantren || prev.nama_pesantren),
          kota_surat: String(settingRow.kota_surat || prev.kota_surat),
          tahun_ajaran_aktif: String(settingRow.tahun_ajaran_aktif || prev.tahun_ajaran_aktif),
          nama_pengasuh: String(settingRow.nama_pengasuh || prev.nama_pengasuh),
          nama_kepala_pondok: String(settingRow.nama_kepala_pondok || prev.nama_kepala_pondok),
          nama_sekretaris: String(settingRow.nama_sekretaris || prev.nama_sekretaris),
          ttd_pengasuh_url:
            ((settingRow.ttd_pengasuh_url || settingRow.ttd_pengasuh) as string | null) || null,
          ttd_kepala_pondok_url:
            ((settingRow.ttd_kepala_pondok_url || settingRow.ttd_kepala_pondok) as string | null) ||
            null,
          ttd_sekretaris_url:
            ((settingRow.ttd_sekretaris_url || settingRow.ttd_sekretaris) as string | null) || null,
          stempel_url:
            ((settingRow.stempel_url ||
              settingRow.stempel_pondok_url ||
              settingRow.url_stempel) as string | null) || null,
        }));
      }

      const mergedRooms = [...DEFAULT_KAMAR_ORDER];
      for (const s of santriKamarRows) {
        const km = String(s.kamar || '').trim();
        if (km && !mergedRooms.some((r) => r.toLowerCase() === km.toLowerCase())) {
          mergedRooms.push(km);
        }
      }
      setKamarOrder(mergedRooms);

      let resolvedPengurus: RawPengurusPersonalia[] = [];
      if (amanRows.length > 0) {
        const jabMap = new Map<string, RawJabatanPersonalia[]>();
        for (const j of jabatanRows) {
          const pid = String(j.pengurus_id || '');
          if (!pid) continue;
          const list = jabMap.get(pid) || [];
          list.push({
            divisi: normalizeDivisiName(String(j.divisi || '')),
            nama_jabatan: String(j.nama_jabatan || ''),
            urutan_struktur: Number(j.urutan_struktur || 10),
          });
          jabMap.set(pid, list);
        }
        resolvedPengurus = amanRows.map((p) => {
          const pid = String(p.id || '');
          const embedded = Array.isArray(p.jabatan_list)
            ? (p.jabatan_list as Array<Record<string, unknown>>).map((j) => ({
                divisi: normalizeDivisiName(String(j.divisi || '')),
                nama_jabatan: String(j.nama_jabatan || ''),
                urutan_struktur: Number(j.urutan_struktur || 10),
              }))
            : [];
          return {
            id: pid,
            nama_lengkap: String(p.nama_lengkap || ''),
            status: String(p.status || 'aktif'),
            masa_khidmat: String(p.masa_khidmat || ''),
            jabatan_list: jabMap.get(pid) || embedded,
          };
        });
      } else {
        const lengkapRows = await fetchSafeTable('v_pengurus_lengkap');
        resolvedPengurus = lengkapRows.map((p) => ({
          id: String(p.id || ''),
          nama_lengkap: String(p.nama_lengkap || ''),
          status: String(p.status || 'aktif'),
          masa_khidmat: String(p.masa_khidmat || ''),
          jabatan_list: Array.isArray(p.jabatan_list)
            ? (p.jabatan_list as Array<Record<string, unknown>>).map((j) => ({
                divisi: normalizeDivisiName(String(j.divisi || '')),
                nama_jabatan: String(j.nama_jabatan || ''),
                urutan_struktur: Number(j.urutan_struktur || 10),
              }))
            : [],
        }));
      }
      setPengurusRows(resolvedPengurus);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data laporan.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canViewBisyaroh]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const t = getLocalTodayStr();
      const fri = getNearestFridayIso(t);
      setTodayStr(t);
      setAnchorDate(fri);
      setMonthStr(t.slice(0, 7));
      setRangeStart(addDaysIso(t, -6));
      setRangeEnd(t);
      void loadData();
    });
    return () => {
      active = false;
    };
  }, [loadData]);

  const periodWindow = useMemo(() => {
    if (!todayStr) return null;
    return computePeriodWindow(mode, {
      anchorDate: anchorDate || getNearestFridayIso(todayStr),
      monthStr: monthStr || todayStr.slice(0, 7),
      startDate: rangeStart || addDaysIso(todayStr, -6),
      endDate: rangeEnd || todayStr,
      todayStr,
    });
  }, [mode, anchorDate, monthStr, rangeStart, rangeEnd, todayStr]);

  const bundle = useMemo(() => {
    if (!rawData || !periodWindow || !todayStr) return null;
    return buildAllDivisionReports(rawData, periodWindow, todayStr, { canViewBisyaroh });
  }, [rawData, periodWindow, todayStr, canViewBisyaroh]);

  const activeRange = useMemo(
    () => computeActiveRangeDates(mode, anchorDate, monthStr, rangeStart, rangeEnd, todayStr),
    [mode, anchorDate, monthStr, rangeStart, rangeEnd, todayStr]
  );

  const extraReports = useMemo(() => {
    const { start, end, prevStart, prevEnd } = activeRange;
    const inCur = (iso: string) => Boolean(iso && iso >= start && iso <= end);
    const inPrev = (iso: string) => Boolean(iso && iso >= prevStart && iso <= prevEnd);

    // 1. Kebersihan & Piket
    const kebWithDate = extraRaw.kebersihanRows.map((r) => ({
      row: r,
      iso: extractRowDateIso(r),
    }));
    const kebTimed = kebWithDate.filter((x) => inCur(x.iso));
    const kebActive = kebTimed.length > 0 ? kebTimed : kebWithDate.filter((x) => !x.iso);
    const kebPrevCount = kebWithDate.filter((x) => inPrev(x.iso)).length;

    let kebSelesai = 0;
    let kebBelum = 0;
    for (const { row } of kebActive) {
      const status = String(row.status || '').toLowerCase();
      const isDone =
        row.selesai === true ||
        row.checked === true ||
        /selesai|bersih|sudah|terlaksana|done|valid|tuntas/.test(status);
      if (isDone) kebSelesai += 1;
      else kebBelum += 1;
    }
    const kebTotal = kebActive.length;
    const kebPersen = kebTotal > 0 ? Math.round((kebSelesai / kebTotal) * 100) : 0;
    const kebDetail = kebActive
      .slice()
      .sort((a, b) => b.iso.localeCompare(a.iso))
      .slice(0, 20)
      .map(({ row, iso }) => ({
        tanggal: formatIsoDisplay(iso),
        area: extractTextField(row, ['area', 'kamar', 'lokasi', 'zona', 'tempat']),
        tugas: extractTextField(row, ['tugas', 'nama_tugas', 'judul', 'kegiatan', 'petugas', 'penanggung_jawab']),
        status: extractTextField(row, ['status'], row.selesai === true ? 'Selesai' : 'Terjadwal'),
      }));

    const sixWeekWindows = buildSixWeekWindows(end);

    // 2. Koperasi Pondok
    const kopWithDate = extraRaw.koperasiTransaksiRows.map((r) => ({
      row: r,
      iso: extractRowDateIso(r),
    }));
    const kopCur = kopWithDate.filter((x) => inCur(x.iso));
    const kopPrev = kopWithDate.filter((x) => inPrev(x.iso));

    const classifyKop = (row: Record<string, unknown>): 'masuk' | 'keluar' => {
      const jenis = `${String(row.jenis || '')} ${String(row.tipe || '')} ${String(row.kategori || '')} ${String(row.arah || '')}`.toLowerCase();
      if (/kulaan|beli|kulak|keluar|beban|operasional|out|expense/.test(jenis)) return 'keluar';
      return 'masuk';
    };

    let kopMasuk = 0;
    let kopKeluar = 0;
    for (const { row } of kopCur) {
      const amt = extractNumericField(row, ['nominal', 'total', 'jumlah', 'harga_total', 'nilai']);
      if (classifyKop(row) === 'keluar') kopKeluar += amt;
      else kopMasuk += amt;
    }
    let kopPrevMasuk = 0;
    for (const { row } of kopPrev) {
      if (classifyKop(row) === 'masuk') {
        kopPrevMasuk += extractNumericField(row, ['nominal', 'total', 'jumlah', 'harga_total', 'nilai']);
      }
    }
    const kopWeeklyOmset = sixWeekWindows.map((win) => {
      let omset = 0;
      let transaksi = 0;
      for (const { row, iso } of kopWithDate) {
        if (!iso || iso < win.start || iso > win.end) continue;
        if (classifyKop(row) === 'masuk') {
          omset += extractNumericField(row, ['nominal', 'total', 'jumlah', 'harga_total', 'nilai']);
          transaksi += 1;
        }
      }
      return {
        label: win.label,
        shortLabel: win.shortLabel,
        omset,
        transaksi,
      };
    });
    const kopTotal6Pekan = kopWeeklyOmset.reduce((acc, w) => acc + w.omset, 0);
    const kopMax6Pekan = Math.max(1, ...kopWeeklyOmset.map((w) => w.omset));

    const kopDetail = kopCur
      .slice()
      .sort((a, b) => b.iso.localeCompare(a.iso))
      .slice(0, 20)
      .map(({ row, iso }) => ({
        tanggal: formatIsoDisplay(iso),
        keterangan: extractTextField(row, ['keterangan', 'nama_barang', 'produk', 'uraian', 'judul']),
        jenis: extractTextField(row, ['jenis', 'tipe', 'metode', 'sumber_dana', 'kategori'], 'Transaksi'),
        nominal: extractNumericField(row, ['nominal', 'total', 'jumlah', 'harga_total', 'nilai']),
        isKeluar: classifyKop(row) === 'keluar',
      }));

    // 3. Pendaftaran Santri Baru (PSB)
    const isPsbVerifOrAktif = (row: Record<string, unknown>): boolean => {
      if (row.dp_terverifikasi === true || row.terverifikasi === true) return true;
      const st = String(row.status || row.status_pendaftaran || '').toLowerCase();
      return /verif|lunas|diterima|resmi|aktif|selesai|disetujui/.test(st);
    };

    const psbWithDate = extraRaw.psbRows.map((r) => ({
      row: r,
      iso: extractRowDateIso(r),
    }));
    const psbCur = psbWithDate.filter((x) => inCur(x.iso));
    const psbPrevCount = psbWithDate.filter((x) => inPrev(x.iso)).length;
    let psbVerif = 0;
    let psbMenunggu = 0;
    let psbTotalBayar = 0;
    for (const { row } of psbCur) {
      if (isPsbVerifOrAktif(row)) psbVerif += 1;
      else psbMenunggu += 1;
      psbTotalBayar += extractNumericField(row, [
        'total_dibayar',
        'nominal_bayar',
        'jumlah_bayar',
        'sudah_bayar',
        'dp_bayar',
        'nominal',
      ]);
    }
    const psbTotalAll = extraRaw.psbRows.length;
    const psbKuotaMaks = 100;
    const psbKuotaTerpakai = psbWithDate.filter(({ row }) => isPsbVerifOrAktif(row)).length;
    const psbSisaKuota = Math.max(0, psbKuotaMaks - psbKuotaTerpakai);
    const psbPersenKuota = Math.min(100, Math.round((psbKuotaTerpakai / psbKuotaMaks) * 100));

    const psbWeeklyTrend = sixWeekWindows.map((win) => {
      let total = 0;
      let verif = 0;
      for (const { row, iso } of psbWithDate) {
        if (!iso || iso < win.start || iso > win.end) continue;
        total += 1;
        if (isPsbVerifOrAktif(row)) verif += 1;
      }
      return {
        label: win.label,
        shortLabel: win.shortLabel,
        total,
        verif,
      };
    });
    const psbMaxTrend = Math.max(1, ...psbWeeklyTrend.map((w) => w.total));

    const psbDetail = psbCur
      .slice()
      .sort((a, b) => b.iso.localeCompare(a.iso))
      .slice(0, 20)
      .map(({ row, iso }) => ({
        tanggal: formatIsoDisplay(iso),
        nama: extractTextField(row, ['nama_lengkap', 'nama_santri', 'nama', 'no_registrasi']),
        noReg: extractTextField(row, ['no_registrasi', 'kode_psb', 'kode'], '-'),
        program: extractTextField(row, ['program', 'jenjang', 'paket', 'kamar_tujuan', 'asal_daerah']),
        status: formatPsbStatusLabel(
          extractTextField(row, ['status', 'status_pendaftaran'], 'Terdaftar')
        ),
      }));

    return {
      kebersihan: {
        totalTugas: kebTotal,
        prevTotalTugas: kebPrevCount,
        selesai: kebSelesai,
        belum: kebBelum,
        persenBersih: kebPersen,
        detail: kebDetail,
      },
      koperasi: {
        totalTransaksi: kopCur.length,
        totalProduk: extraRaw.koperasiProdukRows.length,
        pemasukan: kopMasuk,
        prevPemasukan: kopPrevMasuk,
        pengeluaran: kopKeluar,
        surplus: kopMasuk - kopKeluar,
        weeklyOmset: kopWeeklyOmset,
        totalOmset6Pekan: kopTotal6Pekan,
        maxOmset6Pekan: kopMax6Pekan,
        detail: kopDetail,
      },
      psb: {
        pendaftarPeriode: psbCur.length,
        prevPendaftar: psbPrevCount,
        totalSemua: psbTotalAll,
        terverifikasi: psbVerif,
        menunggu: psbMenunggu,
        totalBayar: psbTotalBayar,
        kuotaMaks: psbKuotaMaks,
        kuotaTerpakai: psbKuotaTerpakai,
        sisaKuota: psbSisaKuota,
        persenKuota: psbPersenKuota,
        weeklyTrend: psbWeeklyTrend,
        maxTrend: psbMaxTrend,
        detail: psbDetail,
      },
    };
  }, [activeRange, extraRaw]);

  const perizinanReportRows = useMemo(() => {
    if (!todayStr) return [];
    const { start, end } = activeRange;
    const refToday = todayStr;
    const santriMap = new Map<string, { nama: string; kamar: string }>();

    const ingestSantri = (rows: Array<Record<string, unknown>>) => {
      for (const s of rows) {
        const sid = String(s.id || '');
        if (!sid) continue;
        santriMap.set(sid, {
          nama: extractTextField(s, ['nama_lengkap', 'nama_santri', 'nama'], '-'),
          kamar: extractTextField(s, ['kamar', 'nama_kamar'], '-'),
        });
      }
    };
    ingestSantri(extraRaw.santriRows);

    const rawRec = (rawData as unknown as Record<string, unknown> | null) || null;
    let rawPerizinanArr: Array<Record<string, unknown>> = [];
    if (rawRec) {
      for (const val of Object.values(rawRec)) {
        if (!Array.isArray(val) || val.length === 0) continue;
        const sample = val[0];
        if (!sample || typeof sample !== 'object') continue;
        const rec = sample as Record<string, unknown>;
        if ('nama_lengkap' in rec && 'kamar' in rec && !('keperluan' in rec) && !('tanggal_pulang' in rec)) {
          ingestSantri(val as Array<Record<string, unknown>>);
        }
        if (
          'tanggal_pulang' in rec ||
          'tgl_pulang' in rec ||
          'rencana_kembali' in rec ||
          'tanggal_rencana_kembali' in rec ||
          'keperluan' in rec
        ) {
          rawPerizinanArr = val as Array<Record<string, unknown>>;
        }
      }
    }

    const mergedPerizinan = mergeUniqueRows(
      [extraRaw.perizinanRows, rawPerizinanArr],
      ['perizinan', 'izin_pulang']
    );

    interface PerizinanDetailRow {
      id: string;
      namaSantri: string;
      kamar: string;
      tglPulangIso: string;
      tglPulang: string;
      rencanaKembaliIso: string;
      rencanaKembali: string;
      tglKembaliIso: string;
      tglKembali: string;
      keperluan: string;
      keterangan: 'Tepat Waktu' | 'Terlambat' | 'Sedang Izin / Terlambat Kembali' | 'Sedang Izin';
    }

    const rows: PerizinanDetailRow[] = [];
    mergedPerizinan.forEach((row, idx) => {
      const tglPulangIso = extractIsoFromFields(row, [
        'tanggal_pulang',
        'tgl_pulang',
        'tanggal_izin',
        'tgl_izin',
        'tanggal_keluar',
        'tgl_keluar',
        'tanggal_mulai',
        'tanggal',
        'created_at',
      ]);
      const rencanaKembaliIso = extractIsoFromFields(row, [
        'rencana_kembali',
        'tanggal_rencana_kembali',
        'tgl_rencana_kembali',
        'estimasi_kembali',
        'tanggal_estimasi_kembali',
        'batas_kembali',
        'tanggal_batas_kembali',
      ]);
      const actualKembaliCandidate = extractIsoFromFields(row, [
        'tanggal_kembali_aktual',
        'tgl_kembali_aktual',
        'tanggal_kembali_riil',
        'tgl_kembali_riil',
        'kembali_pada',
        'waktu_kembali',
        'tanggal_masuk',
        'tgl_masuk',
        'returned_at',
      ]);
      const genericTglKembali = extractIsoFromFields(row, ['tanggal_kembali', 'tgl_kembali']);
      const statusLower = String(row.status || row.status_izin || '').toLowerCase();

      const resolvedRencanaIso =
        rencanaKembaliIso || (actualKembaliCandidate ? genericTglKembali : '');
      const hasNotReturnedStatus =
        /sedang|belum|keluar|aktif|berlangsung|menunggu/.test(statusLower) &&
        !/sudah|selesai|kembali|tepat/.test(statusLower);

      const resolvedTglKembaliIso =
        actualKembaliCandidate || (hasNotReturnedStatus ? '' : genericTglKembali);

      const inWindow =
        (tglPulangIso && tglPulangIso >= start && tglPulangIso <= end) ||
        (resolvedTglKembaliIso && resolvedTglKembaliIso >= start && resolvedTglKembaliIso <= end);
      if (!inWindow) return;

      const sid = String(row.santri_id || '');
      const santriInfo = sid ? santriMap.get(sid) : undefined;
      const nestedSantri =
        row.santri && typeof row.santri === 'object'
          ? (row.santri as Record<string, unknown>)
          : null;

      const namaSantri =
        santriInfo?.nama ||
        (nestedSantri ? extractTextField(nestedSantri, ['nama_lengkap', 'nama'], '') : '') ||
        extractTextField(row, ['nama_santri', 'nama_lengkap', 'nama'], '-');
      const kamar =
        santriInfo?.kamar ||
        (nestedSantri ? extractTextField(nestedSantri, ['kamar', 'nama_kamar'], '') : '') ||
        extractTextField(row, ['kamar', 'kamar_santri', 'nama_kamar'], '-');
      let keperluan = '-';
      for (const fieldName of ['keperluan', 'alasan', 'tujuan', 'keterangan', 'jenis_izin']) {
        const rawVal = row[fieldName];
        if (typeof rawVal === 'string' && rawVal.trim()) {
          const parsedVal = parseCleanKeperluan(rawVal);
          if (parsedVal !== '-') {
            keperluan = parsedVal;
            break;
          }
        }
      }

      let keterangan: PerizinanDetailRow['keterangan'];
      if (resolvedTglKembaliIso) {
        if (resolvedRencanaIso && resolvedTglKembaliIso > resolvedRencanaIso) {
          keterangan = 'Terlambat';
        } else {
          keterangan = 'Tepat Waktu';
        }
      } else if (resolvedRencanaIso && refToday > resolvedRencanaIso) {
        keterangan = 'Sedang Izin / Terlambat Kembali';
      } else {
        keterangan = 'Sedang Izin';
      }

      rows.push({
        id: String(row.id || `izin-${idx}`),
        namaSantri,
        kamar,
        tglPulangIso,
        tglPulang: tglPulangIso ? formatIsoDisplay(tglPulangIso) : '-',
        rencanaKembaliIso: resolvedRencanaIso,
        rencanaKembali: resolvedRencanaIso ? formatIsoDisplay(resolvedRencanaIso) : '-',
        tglKembaliIso: resolvedTglKembaliIso,
        tglKembali: resolvedTglKembaliIso ? formatIsoDisplay(resolvedTglKembaliIso) : '-',
        keperluan,
        keterangan,
      });
    });

    rows.sort((a, b) => b.tglPulangIso.localeCompare(a.tglPulangIso));
    return rows;
  }, [activeRange, extraRaw, rawData, todayStr]);

  const kegiatanLampiranFoto = useMemo<KegiatanLampiranItem[]>(() => {
    const { start, end } = activeRange;
    const out: KegiatanLampiranItem[] = [];
    for (const row of extraRaw.kegiatanRows) {
      const judul = String(row.judul || '').trim();
      if (!judul) continue;
      const rawUrls = row.dokumentasi_urls;
      if (!Array.isArray(rawUrls)) continue;
      const urls = rawUrls
        .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        .map((u) => u.trim());
      if (urls.length === 0) continue;

      const iso = extractRowDateIso(row);
      if (iso && (iso < start || iso > end)) continue;

      out.push({
        id: String(row.id || `${judul}-${iso}-${out.length}`),
        judul,
        tanggal: iso,
        jamMulai: String(row.jam_mulai || ''),
        lokasi: String(row.lokasi || ''),
        notulensi: String(row.notulensi || '').trim(),
        urls,
      });
    }
    return out.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  }, [activeRange, extraRaw.kegiatanRows]);

  const baseSelectedDivisions = useMemo(
    () =>
      selectedDivisions.filter((k): k is LaporanDivisionKey =>
        BASE_DIV_KEYS.includes(k as LaporanDivisionKey)
      ),
    [selectedDivisions]
  );

  const extraSelectedDivisions = useMemo(
    () => selectedDivisions.filter((k): k is ExtraDivisionKey => isExtraKey(k)),
    [selectedDivisions]
  );

  const strukturPersonalia = useMemo(() => {
    const activeTa =
      pengaturanApproval.tahun_ajaran_aktif ||
      (todayStr ? getTahunAjaranForDate(todayStr) : '');
    const aktifAll = pengurusRows.filter((p) => p.status === 'aktif');
    const matchedTa = activeTa ? aktifAll.filter((p) => p.masa_khidmat === activeTa) : [];
    const sourcePeople = matchedTa.length > 0 ? matchedTa : aktifAll;

    const dewanHarianSlots = DEWAN_HARIAN_ORDER.map((jabatan, index) => {
      const names: string[] = [];
      for (const person of sourcePeople) {
        for (const jab of person.jabatan_list) {
          if (isExcludedTopLeadership(jab.divisi, jab.nama_jabatan)) continue;
          if (
            normalizeDivisiName(jab.divisi).toLowerCase() === 'dewan harian' &&
            jab.nama_jabatan.trim().toLowerCase() === jabatan.toLowerCase()
          ) {
            names.push(person.nama_lengkap);
          }
        }
      }
      return {
        nomor: index + 1,
        jabatan,
        names,
      };
    });

    const plenoSections = PLENO_DIVISI_ORDER.map((sec) => {
      interface MemberEntry {
        nama: string;
        peran: string;
        rank: number;
        urutan: number;
        kamarIdx: number;
        kamarName: string;
      }
      const members: MemberEntry[] = [];
      for (const person of sourcePeople) {
        for (const jab of person.jabatan_list) {
          if (isExcludedTopLeadership(jab.divisi, jab.nama_jabatan)) continue;
          const divLower = normalizeDivisiName(jab.divisi).toLowerCase();
          if (!sec.aliases.includes(divLower)) continue;

          const rank = getRoleRank(jab.nama_jabatan, jab.urutan_struktur);
          if (sec.letter === 'K') {
            const kamarName = jab.nama_jabatan.replace(/^Musyrif\s+Kamar\s+/i, '').trim();
            const kIdx = kamarOrder.findIndex(
              (k) => k.toLowerCase() === kamarName.toLowerCase()
            );
            members.push({
              nama: person.nama_lengkap,
              peran: kamarName ? `Musyrif Kamar ${kamarName}` : jab.nama_jabatan || 'Musyrif Kamar',
              rank,
              urutan: jab.urutan_struktur || 10,
              kamarIdx: kIdx === -1 ? 999 : kIdx,
              kamarName,
            });
          } else {
            members.push({
              nama: person.nama_lengkap,
              peran: formatCleanSectionRole(jab.divisi, jab.nama_jabatan, jab.urutan_struktur),
              rank,
              urutan: jab.urutan_struktur || 10,
              kamarIdx: 0,
              kamarName: '',
            });
          }
        }
      }

      members.sort((a, b) => {
        if (sec.letter === 'K') {
          if (a.kamarIdx !== b.kamarIdx) return a.kamarIdx - b.kamarIdx;
          const kCmp = a.kamarName.localeCompare(b.kamarName, 'id', { numeric: true });
          if (kCmp !== 0) return kCmp;
        }
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.urutan !== b.urutan) return a.urutan - b.urutan;
        return a.nama.localeCompare(b.nama, 'id');
      });

      return {
        letter: sec.letter,
        label: sec.label,
        members,
      };
    });

    return {
      dewanHarianSlots,
      plenoSections,
      totalOperationalAssignments:
        dewanHarianSlots.reduce((acc, s) => acc + s.names.length, 0) +
        plenoSections.reduce((acc, s) => acc + s.members.length, 0),
    };
  }, [pengurusRows, kamarOrder, pengaturanApproval.tahun_ajaran_aktif, todayStr]);

  const pengurusAktifCount = useMemo(() => {
    const activeTa =
      pengaturanApproval.tahun_ajaran_aktif ||
      (todayStr ? getTahunAjaranForDate(todayStr) : '');
    const aktifAll = pengurusRows.filter((p) => p.status === 'aktif');
    const matchedTa = activeTa ? aktifAll.filter((p) => p.masa_khidmat === activeTa) : [];
    const sourcePeople = matchedTa.length > 0 ? matchedTa : aktifAll;
    return sourcePeople.filter((person) => {
      if (!Array.isArray(person.jabatan_list) || person.jabatan_list.length === 0) {
        return false;
      }
      return person.jabatan_list.some(
        (jab) => !isExcludedTopLeadership(jab.divisi, jab.nama_jabatan)
      );
    }).length;
  }, [pengurusRows, pengaturanApproval.tahun_ajaran_aktif, todayStr]);

  const syahriyahTunggakan = useMemo(() => {
    if (!todayStr) {
      return {
        totalNominal: 0,
        totalSantriMenunggak: 0,
        totalBulanMenunggak: 0,
        detail: [] as Array<{
          id: string;
          namaSantri: string;
          kamar: string;
          tglMasuk: string;
          bulanMenunggak: string;
          jumlahBulan: number;
          totalTunggakan: number;
        }>,
      };
    }

    const BULAN_SHORT = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Agu',
      'Sep',
      'Okt',
      'Nov',
      'Des',
    ];
    const formatYmShort = (ym: string) => {
      const [y, m] = ym.split('-');
      const idx = Math.max(0, Math.min(11, Number(m) - 1));
      return `${BULAN_SHORT[idx]} ${y.slice(-2)}`;
    };

    const [nowY, nowM, nowD] = todayStr.split('-').map(Number);
    const activeTa = pengaturanApproval.tahun_ajaran_aktif || getTahunAjaranForDate(todayStr);
    const taMatch = activeTa.match(/(\d{4})/);
    const taStartYear = taMatch ? Number(taMatch[1]) : nowM >= 7 ? nowY : nowY - 1;

    // Bulan tagihan Syahriyah berjalan dalam Tahun Ajaran (Juli s/d bulan jatuh tempo, tgl > 10 termasuk bulan berjalan)
    let cutoffY = nowY;
    let cutoffM = nowM;
    if (nowD <= 10) {
      if (nowM === 1) {
        cutoffY = nowY - 1;
        cutoffM = 12;
      } else {
        cutoffM = nowM - 1;
      }
    }
    const cutoffYm = `${cutoffY}-${String(cutoffM).padStart(2, '0')}`;

    const taMonths: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const mTotal = 7 + i;
      const y = mTotal > 12 ? taStartYear + 1 : taStartYear;
      const m = mTotal > 12 ? mTotal - 12 : mTotal;
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      if (ym <= cutoffYm) {
        taMonths.push(ym);
      }
    }

    // Ambil daftar santri dari extraRaw.santriRows atau fallback rawData
    let santriList = extraRaw.santriRows;
    if (santriList.length === 0 && rawData) {
      const rawRec = rawData as unknown as Record<string, unknown>;
      for (const val of Object.values(rawRec)) {
        if (
          Array.isArray(val) &&
          val.length > 0 &&
          val[0] &&
          typeof val[0] === 'object' &&
          'nama_lengkap' in (val[0] as Record<string, unknown>) &&
          'kamar' in (val[0] as Record<string, unknown>)
        ) {
          santriList = val as Array<Record<string, unknown>>;
          break;
        }
      }
    }

    // Cari master item Syahriyah & nominal default
    const masterSyah = extraRaw.masterPembayaranRows.find((r) => {
      const kode = String(r.kode || r.kode_item || '').toLowerCase();
      const nama = String(r.nama || r.nama_item || r.judul || '').toLowerCase();
      return kode.includes('syahriyah') || nama.includes('syahriyah');
    });
    const syahKode = String(masterSyah?.kode || masterSyah?.kode_item || 'SYAHRIYAH').toLowerCase();
    let defaultTarif = extractNumericField(masterSyah || {}, ['nominal', 'tarif', 'jumlah', 'biaya']);

    if (defaultTarif <= 0) {
      for (const s of santriList) {
        const t = extractNumericField(s, ['tarif_syahriyah', 'nominal_syahriyah', 'syahriyah']);
        if (t > 0) {
          defaultTarif = t;
          break;
        }
      }
    }

    const riwayatTarifForMonth = (ym: string): number => {
      const matched = extraRaw.masterRiwayatRows
        .filter((rw) => {
          const kode = String(rw.kode_item || rw.kode || '').toLowerCase();
          const nama = String(rw.nama_item || rw.nama || '').toLowerCase();
          if (kode && kode !== syahKode && !kode.includes('syahriyah') && !nama.includes('syahriyah')) {
            return false;
          }
          const mulai = String(rw.berlaku_mulai || rw.periode || '').slice(0, 7);
          return !mulai || mulai <= ym;
        })
        .sort((a, b) =>
          String(b.berlaku_mulai || b.periode || '').localeCompare(
            String(a.berlaku_mulai || a.periode || '')
          )
        );
      if (matched.length > 0) {
        const n = extractNumericField(matched[0], ['nominal', 'tarif', 'jumlah']);
        if (n > 0) return n;
      }
      return defaultTarif;
    };

    const normalizePeriodYm = (rawVal: unknown): string[] => {
      if (typeof rawVal !== 'string') return [];
      const matches = rawVal.match(/\b20\d{2}[-/](?:0?[1-9]|1[0-2])\b/g) || [];
      return matches.map((tok) => {
        const [yy, mm] = tok.split(/[-/]/);
        return `${yy}-${String(Number(mm)).padStart(2, '0')}`;
      });
    };

    const paidMonthsBySantri = new Map<string, Set<string>>();
    const addPaidMonth = (sid: string, ym: string) => {
      if (!sid || !/^\d{4}-\d{2}$/.test(ym)) return;
      const set = paidMonthsBySantri.get(sid) || new Set<string>();
      set.add(ym);
      paidMonthsBySantri.set(sid, set);
    };

    for (const d of extraRaw.pembayaranDetailRows) {
      const statusLower = String(d.status || '').toLowerCase();
      if (statusLower === 'batal' || statusLower === 'dibatalkan') continue;
      const sid = String(d.santri_id || '');
      if (!sid) continue;
      const kode = String(d.kode_item || d.kode || d.jenis_pembayaran || '').toLowerCase();
      const nama = String(d.nama_item || d.nama || d.keterangan || '').toLowerCase();
      const isSyahriyah =
        !kode ||
        kode === syahKode ||
        kode.includes('syahriyah') ||
        nama.includes('syahriyah') ||
        kode.includes('spp');
      if (!isSyahriyah) continue;

      const rawCandidates = [d.periode_tagihan, d.periode, d.bulan_tagihan, d.bulan_periode];
      let foundYm = false;
      for (const c of rawCandidates) {
        const yms = normalizePeriodYm(c);
        if (yms.length > 0) {
          yms.forEach((ym) => addPaidMonth(sid, ym));
          foundYm = true;
        }
      }
      if (!foundYm && d.tahun && d.bulan) {
        const yNum = Number(d.tahun);
        const mNum = Number(d.bulan);
        if (yNum >= 2020 && mNum >= 1 && mNum <= 12) {
          addPaidMonth(sid, `${yNum}-${String(mNum).padStart(2, '0')}`);
        }
      }
    }

    // Fallback transaksi keuangan masuk Syahriyah per santri
    for (const trx of extraRaw.keuanganTransaksiRows) {
      const sid = String(trx.santri_id || '');
      if (!sid) continue;
      const tipe = String(trx.tipe || trx.jenis || '').toLowerCase();
      if (tipe && !/masuk|in|terima/.test(tipe)) continue;
      const kat = `${String(trx.kategori || '')} ${String(trx.uraian || '')} ${String(
        trx.keterangan || ''
      )}`.toLowerCase();
      if (!kat.includes('syahriyah') && !kat.includes('spp')) continue;

      const yms = [
        ...normalizePeriodYm(trx.periode_tagihan),
        ...normalizePeriodYm(trx.periode),
        ...normalizePeriodYm(trx.keterangan),
        ...normalizePeriodYm(trx.uraian),
      ];
      yms.forEach((ym) => addPaidMonth(sid, ym));
    }

    const detail: Array<{
      id: string;
      namaSantri: string;
      kamar: string;
      tglMasuk: string;
      bulanMenunggak: string;
      jumlahBulan: number;
      totalTunggakan: number;
    }> = [];

    let totalNominal = 0;
    let totalBulanMenunggak = 0;

    for (const s of santriList) {
      const statusLower = String(s.status || s.status_santri || 'aktif').trim().toLowerCase();
      if (statusLower !== 'aktif') continue;

      const hasExplicitTarif =
        s.tarif_syahriyah !== undefined &&
        s.tarif_syahriyah !== null &&
        String(s.tarif_syahriyah).trim() !== '';
      const santriCustomTarif = hasExplicitTarif ? Number(s.tarif_syahriyah) : null;
      if (santriCustomTarif !== null && (!Number.isFinite(santriCustomTarif) || santriCustomTarif <= 0)) {
        continue;
      }

      const sid = String(s.id || '');
      if (!sid) continue;

      const tglMasukIso = extractIsoFromFields(s, ['tgl_masuk', 'tanggal_masuk', 'created_at']);
      let startBillingYm = `${taStartYear}-07`;
      if (tglMasukIso && /^\d{4}-\d{2}-\d{2}$/.test(tglMasukIso)) {
        const [mY, mM, mD] = tglMasukIso.split('-').map(Number);
        // Aturan cutoff tanggal 25: masuk > tgl 25 mulai ditagih bulan berikutnya
        const bY = mD > 25 && mM === 12 ? mY + 1 : mY;
        const bM = mD > 25 ? (mM === 12 ? 1 : mM + 1) : mM;
        startBillingYm = `${bY}-${String(bM).padStart(2, '0')}`;
      }

      const paidSet = paidMonthsBySantri.get(sid) || new Set<string>();
      const unpaidMonths = taMonths.filter((ym) => ym >= startBillingYm && !paidSet.has(ym));
      if (unpaidMonths.length === 0) continue;

      let nominalSantri = 0;
      for (const ym of unpaidMonths) {
        const tarifBulan =
          santriCustomTarif !== null && santriCustomTarif > 0
            ? santriCustomTarif
            : riwayatTarifForMonth(ym);
        nominalSantri += tarifBulan;
      }
      if (nominalSantri <= 0) continue;

      totalNominal += nominalSantri;
      totalBulanMenunggak += unpaidMonths.length;

      detail.push({
        id: sid,
        namaSantri: extractTextField(s, ['nama_lengkap', 'nama_santri', 'nama'], '-'),
        kamar: extractTextField(s, ['kamar', 'nama_kamar'], '-'),
        tglMasuk: tglMasukIso ? formatIsoDisplay(tglMasukIso) : '-',
        bulanMenunggak: unpaidMonths.map(formatYmShort).join(', '),
        jumlahBulan: unpaidMonths.length,
        totalTunggakan: nominalSantri,
      });
    }

    detail.sort((a, b) => {
      if (b.totalTunggakan !== a.totalTunggakan) return b.totalTunggakan - a.totalTunggakan;
      return a.namaSantri.localeCompare(b.namaSantri, 'id');
    });

    return {
      totalNominal,
      totalSantriMenunggak: detail.length,
      totalBulanMenunggak,
      detail,
    };
  }, [
    todayStr,
    pengaturanApproval.tahun_ajaran_aktif,
    extraRaw.santriRows,
    extraRaw.masterPembayaranRows,
    extraRaw.masterRiwayatRows,
    extraRaw.pembayaranDetailRows,
    extraRaw.keuanganTransaksiRows,
    rawData,
  ]);

  useLayoutEffect(() => {
    const docRoot = docWrapperRef.current;
    const personaliaSource = personaliaSourceRef.current;
    const approvalSource = approvalSourceRef.current;
    const tunggakanTableSource = tunggakanTableSourceRef.current;
    const perizinanTableSource = perizinanTableSourceRef.current;
    const kegiatanFotoSource = kegiatanFotoSourceRef.current;
    const extraSource = extraSourceRef.current;

    const cleanupDomPatches = () => {
      if (docRoot) {
        docRoot
          .querySelectorAll(
            '[data-siap-personalia-clone="true"], [data-siap-approval-clone="true"], [data-siap-extra-clone="true"], [data-siap-kamar-grid="true"], [data-siap-kegiatan-foto-clone="true"], [data-siap-chart-clone="true"], [data-siap-kamar-total="true"], [data-siap-perizinan-clone="true"], [data-siap-tunggakan-clone="true"]'
          )
          .forEach((node) => node.remove());
        docRoot
          .querySelectorAll<HTMLElement>('[data-siap-orig-text]')
          .forEach((node) => {
            const orig = node.getAttribute('data-siap-orig-text');
            if (orig !== null) node.textContent = orig;
            node.removeAttribute('data-siap-orig-text');
          });
        docRoot
          .querySelectorAll('[data-siap-hidden-personalia="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-personalia'));
        docRoot
          .querySelectorAll('[data-siap-hidden-approval="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-approval'));
        docRoot
          .querySelectorAll('[data-siap-hidden-kamar="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-kamar'));
        docRoot
          .querySelectorAll('[data-siap-hidden-perizinan="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-perizinan'));
        docRoot
          .querySelectorAll('[data-siap-hidden-tunggakan="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-tunggakan'));
        docRoot
          .querySelectorAll('[data-siap-hidden-kegiatan-foto="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-kegiatan-foto'));
        docRoot
          .querySelectorAll('[data-siap-hidden-signature="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-signature'));
        docRoot
          .querySelectorAll('[data-siap-hidden-chart="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-chart'));
        docRoot
          .querySelectorAll('[data-siap-full-span="true"]')
          .forEach((node) => node.removeAttribute('data-siap-full-span'));
        docRoot
          .querySelectorAll('[data-siap-page-start="true"]')
          .forEach((node) => {
            node.removeAttribute('data-siap-page-start');
            if (node.hasAttribute('data-siap-added-break-cls')) {
              node.classList.remove('break-before-page', 'print:break-before-page');
              node.removeAttribute('data-siap-added-break-cls');
            }
          });
        docRoot
          .querySelectorAll('[data-siap-approval="true"]')
          .forEach((node) => node.removeAttribute('data-siap-approval'));
        docRoot
          .querySelectorAll('[data-siap-table-styled="true"]')
          .forEach((node) => node.removeAttribute('data-siap-table-styled'));
        docRoot
          .querySelectorAll('[data-siap-table-wrap="true"]')
          .forEach((node) => node.removeAttribute('data-siap-table-wrap'));
        docRoot
          .querySelectorAll('[data-siap-card-styled="true"]')
          .forEach((node) => node.removeAttribute('data-siap-card-styled'));
        docRoot
          .querySelectorAll('[data-siap-chart-card="true"]')
          .forEach((node) => node.removeAttribute('data-siap-chart-card'));
        docRoot
          .querySelectorAll('[data-siap-xaxis-label="true"]')
          .forEach((node) => node.removeAttribute('data-siap-xaxis-label'));
      }
    };

    cleanupDomPatches();

    if (loading || !bundle) {
      return cleanupDomPatches;
    }

    const enforceReportFontFloor = (root: HTMLElement) => {
      const textEls = root.querySelectorAll<HTMLElement>(
        'p, li, span, div, label, td, th, dd, dt, a, strong, em, small'
      );
      textEls.forEach((el) => {
        if (el.closest('[data-siap-hidden-personalia="true"]')) return;
        if (el.closest('[data-siap-hidden-approval="true"]')) return;
        if (el.closest('[data-siap-hidden-kamar="true"]')) return;
        if (el.closest('[data-siap-hidden-chart="true"]')) return;
        if (el.closest('[data-siap-izin-table="true"]')) return;
        if (el.hasAttribute('data-siap-xaxis-label') || el.closest('[data-siap-xaxis-label="true"]')) {
          el.style.fontSize = '9pt';
          el.style.whiteSpace = 'nowrap';
          return;
        }
        if (el.closest('h1, h2, h3')) return;
        const hasDirectText = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue || '').trim().length > 0
        );
        if (!hasDirectText) return;
        const computedSize = parseFloat(window.getComputedStyle(el).fontSize || '16');
        if (!computedSize || Number.isNaN(computedSize)) return;
        const inTableOrChartOrCompact = Boolean(
          el.closest(
            'table, svg, [data-siap-chart-card="true"], [data-siap-chart-clone="true"], [data-siap-compact-table="true"]'
          )
        );
        if (inTableOrChartOrCompact) {
          if (computedSize < 14.6) {
            el.style.fontSize = '11pt';
          }
        } else if (computedSize < 15.8) {
          const isEyebrowOrBadge =
            computedSize < 13.5 || /\buppercase\b/.test(el.className || '');
          el.style.fontSize = isEyebrowOrBadge ? '11pt' : '12pt';
        }
      });

      root.querySelectorAll<SVGElement>('svg text, svg tspan').forEach((svgTxt) => {
        if (
          svgTxt.hasAttribute('data-siap-xaxis-label') ||
          svgTxt.closest('[data-siap-xaxis-label="true"]')
        ) {
          svgTxt.style.fontSize = '9pt';
          svgTxt.style.whiteSpace = 'nowrap';
          return;
        }
        const computedSize = parseFloat(window.getComputedStyle(svgTxt).fontSize || '14');
        if (computedSize < 14.6) {
          svgTxt.style.fontSize = '11pt';
        }
      });
    };

    if (!docRoot) {
      document
        .querySelectorAll<HTMLElement>('[data-siap-laporan-doc="true"]')
        .forEach((standaloneDoc) => enforceReportFontFloor(standaloneDoc));
      return cleanupDomPatches;
    }

    const searchContainer =
      (docRoot.querySelector('#pusat-laporan-dokumen') as HTMLElement | null) ||
      (docRoot.firstElementChild as HTMLElement | null) ||
      docRoot;

    // 0. Ganti istilah "Tiket Sarpras" -> "Laporan Sarpras" & bersihkan string [IZIN_META:{...}] di seluruh dokumen
    const textWalker = document.createTreeWalker(searchContainer, NodeFilter.SHOW_TEXT);
    const textNodesToUpdate: Text[] = [];
    let walkedNode = textWalker.nextNode();
    while (walkedNode) {
      if (
        walkedNode.nodeValue &&
        (/tiket\s+sarpras/i.test(walkedNode.nodeValue) || /\[IZIN_META:/i.test(walkedNode.nodeValue))
      ) {
        textNodesToUpdate.push(walkedNode as Text);
      }
      walkedNode = textWalker.nextNode();
    }
    for (const tNode of textNodesToUpdate) {
      if (tNode.nodeValue) {
        let updated = tNode.nodeValue.replace(/tiket\s+sarpras/gi, 'Laporan Sarpras');
        if (/\[IZIN_META:/i.test(updated)) {
          updated = parseCleanKeperluan(updated);
        }
        tNode.nodeValue = updated;
      }
    }

    // Identifikasi blok Lembar Pengesahan di bagian akhir dokumen utama
    const allSectionDivs = Array.from(
      searchContainer.querySelectorAll('section, div, footer')
    ) as HTMLElement[];

    const approvalCandidates = allSectionDivs.filter((el) => {
      if (el === searchContainer) return false;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt.length === 0 || txt.length > 2200) return false;
      if (/\bDivisi\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/i.test(txt)) return false;
      if (/Ringkasan\s+Eksekutif|Struktur\s+Personalia|Lampiran\s+Nota/i.test(txt)) return false;
      return (
        (/Mengetahui/i.test(txt) && /Pengasuh/i.test(txt)) ||
        /Lembar\s+Pengesahan/i.test(txt) ||
        (txt.includes('Sekretaris') &&
          txt.includes('Kepala Pondok') &&
          txt.includes('Pengasuh'))
      );
    });

    const outermostApprovalCandidates = approvalCandidates.filter(
      (cand) => !approvalCandidates.some((other) => other !== cand && other.contains(cand))
    );
    const approvalEl =
      outermostApprovalCandidates[outermostApprovalCandidates.length - 1] || null;

    // Ganti / sinkronkan Lembar Pengesahan agar TTD & Stempel Digital tampil jelas & tidak terpotong di tepi kanan
    if (approvalEl && approvalSource && showCoverAndApproval) {
      const approvalClone = document.createElement('div');
      approvalClone.setAttribute('data-siap-approval-clone', 'true');
      approvalClone.innerHTML = approvalSource.innerHTML;
      const clonedSection = approvalClone.firstElementChild as HTMLElement | null;
      if (clonedSection) {
        clonedSection.setAttribute('data-siap-approval-clone', 'true');
        clonedSection.setAttribute('data-siap-page-start', 'true');
        clonedSection.setAttribute('data-siap-approval', 'true');
        approvalEl.setAttribute('data-siap-hidden-approval', 'true');
        approvalEl.parentElement?.insertBefore(clonedSection, approvalEl);
      }
    } else if (approvalEl) {
      approvalEl.setAttribute('data-siap-page-start', 'true');
      approvalEl.setAttribute('data-siap-approval', 'true');
      if (!useDigitalSignature) {
        approvalEl.querySelectorAll('img').forEach((imgEl) => {
          imgEl.setAttribute('data-siap-hidden-signature', 'true');
        });
      }
    }

    // Identifikasi setiap blok Bab Romawi I..X untuk page-break & injeksi spesifik per bab
    const singleDivSections = allSectionDivs.filter((el) => {
      if (el === searchContainer) return false;
      if (el.closest('[data-siap-personalia-clone="true"]')) return false;
      if (approvalEl && (el === approvalEl || el.contains(approvalEl))) return false;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt.length === 0 || txt.length > 150000) return false;
      if (/Ringkasan\s+Eksekutif/i.test(txt)) return false;
      const romans = txt.match(/\b(?:Divisi|Bab)\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/gi) || [];
      const uniqueRomans = new Set(
        romans.map((r) => r.toUpperCase().replace(/\b(?:DIVISI|BAB)\s+/i, '').trim())
      );
      if (uniqueRomans.size === 1) return true;
      if (el.tagName === 'SECTION' || el.tagName === 'DIV') {
        const headings = Array.from(el.querySelectorAll('h2, h3')).filter(
          (h) =>
            !h.closest('[data-siap-personalia-clone="true"]') &&
            !/^\s*(?:I|II)\.\s*(?:DEWAN\s+HARIAN|PLENO)\b/i.test((h.textContent || '').trim())
        );
        const romanHeadings = headings.filter((h) =>
          /^(?:(?:Divisi|Bab)\s+)?(I|II|III|IV|V|VI|VII|VIII|IX|X)(?:[\s.:·-])+/i.test(
            (h.textContent || '').trim()
          )
        );
        if (romanHeadings.length === 1 && headings[0] === romanHeadings[0]) {
          return true;
        }
      }
      return false;
    });

    const outermostDivSections = singleDivSections.filter(
      (cand) => !singleDivSections.some((other) => other !== cand && other.contains(cand))
    );

    // Setiap Bab Romawi (I s/d X) selalu dimulai di halaman baru
    outermostDivSections.forEach((divEl, idx) => {
      const hasPrevContent =
        idx > 0 || showCoverAndApproval || scope === 'gabungan' || Boolean(divEl.previousElementSibling);
      if (hasPrevContent) {
        divEl.setAttribute('data-siap-page-start', 'true');
      }
    });

    const findDivByMatcher = (rx: RegExp): HTMLElement | null =>
      outermostDivSections.find((el) => {
        const firstH = (el.querySelector('h2, h3')?.textContent || '').replace(/\s+/g, ' ').trim();
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return rx.test(firstH) || rx.test(txt.slice(0, 400));
      }) || null;

    const div1ScopeEl =
      findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+I\b|^\s*I[.\s·:-]+).*(?:Administrasi|Santri)/i) ||
      (Array.from(searchContainer.querySelectorAll<HTMLElement>('section, div')).find((el) => {
        if (el === searchContainer) return false;
        const h = (el.querySelector('h2, h3')?.textContent || '').replace(/\s+/g, ' ').trim();
        return /(?:\b(?:Divisi|Bab)\s+I\b|^\s*I[.\s·:-]+).*(?:Administrasi|Santri)/i.test(h);
      }) || null);
    const div2El = findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+II\b|^\s*II[.\s·:-]+).*(?:Keuangan)/i);
    const div3El = findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+III\b|^\s*III[.\s·:-]+).*(?:Kegiatan)/i);
    const div4El = findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+IV\b|^\s*IV[.\s·:-]+).*(?:Perizinan|Izin)/i);
    const div8El = findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+VIII\b|^\s*VIII[.\s·:-]+).*(?:Dapur)/i);

    // Pastikan Bab I selalu memiliki break-before-page (dimulai di halaman baru tersendiri)
    if (div1ScopeEl) {
      div1ScopeEl.setAttribute('data-siap-page-start', 'true');
      if (!div1ScopeEl.classList.contains('break-before-page')) {
        div1ScopeEl.classList.add('break-before-page', 'print:break-before-page');
        div1ScopeEl.setAttribute('data-siap-added-break-cls', 'true');
      }
    }

    // 0b. Penataan Grafik di Ringkasan Eksekutif -> Pindahkan ke Bab II (Keuangan) & Bab VIII (Dapur)
    const execCandidates = allSectionDivs.filter((el) => {
      if (el === searchContainer) return false;
      if (approvalEl && (el === approvalEl || el.contains(approvalEl))) return false;
      if (outermostDivSections.some((d) => d === el || el.contains(d) || d.contains(el))) return false;
      const heading = el.querySelector('h1, h2, h3, h4, p');
      const hTxt = (heading?.textContent || '').replace(/\s+/g, ' ').trim();
      const fullTxt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return (
        /Ringkasan\s+Eksekutif/i.test(hTxt) &&
        !/\bDivisi\s+I\b/i.test(fullTxt) &&
        fullTxt.length < 35000
      );
    });
    const execSectionEl =
      execCandidates.find(
        (cand) => !execCandidates.some((other) => other !== cand && cand.contains(other))
      ) ||
      execCandidates[0] ||
      null;

    const hasChartVisual = (el: HTMLElement): boolean => {
      const hasChartSvg = Array.from(el.querySelectorAll('svg')).some(
        (svg) =>
          !svg.classList.contains('lucide') &&
          (svg.classList.contains('recharts-surface') ||
            svg.querySelectorAll('rect, path, circle, line, polygon').length >= 3)
      );
      if (hasChartSvg) return true;
      const styledBars = Array.from(el.querySelectorAll<HTMLElement>('div, span')).filter((d) => {
        const st = d.getAttribute('style') || '';
        return /\b(width|height)\s*:\s*[\d.]+%/.test(st) || /\bheight\s*:\s*\d+px/i.test(st);
      });
      if (styledBars.length >= 2) return true;
      if (el.querySelectorAll('[role="progressbar"]').length >= 2) return true;
      return false;
    };

    const normalizeSvgForClone = (root: HTMLElement) => {
      root.querySelectorAll('svg').forEach((svg) => {
        if (svg.classList.contains('lucide')) return;
        const wAttr = svg.getAttribute('width');
        const hAttr = svg.getAttribute('height');
        if (!svg.getAttribute('viewBox') && wAttr && hAttr) {
          const wNum = parseFloat(wAttr);
          const hNum = parseFloat(hAttr);
          if (wNum > 0 && hNum > 0) {
            svg.setAttribute('viewBox', `0 0 ${wNum} ${hNum}`);
          }
        }
        svg.style.maxWidth = '100%';
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.overflow = 'visible';
      });
    };

    const formatChartXAxisLabels = (chartCard: HTMLElement) => {
      // 1. SVG charts (custom SVG atau Recharts)
      chartCard.querySelectorAll('svg').forEach((svg) => {
        if (svg.classList.contains('lucide')) return;
        const allTexts = Array.from(svg.querySelectorAll<SVGTextElement>('text'));
        if (allTexts.length === 0) return;

        let xAxisTexts: SVGTextElement[] = [];
        const rechartsX = Array.from(
          svg.querySelectorAll<SVGTextElement>('.recharts-xAxis text, .recharts-cartesian-axis-tick text')
        );
        if (rechartsX.length > 0) {
          xAxisTexts = rechartsX.filter((t) => {
            const val = (t.textContent || '').trim();
            return !/^\d+(?:%|rb|jt)?$/i.test(val);
          });
        }

        if (xAxisTexts.length === 0) {
          const yCoords = allTexts
            .map((t) => parseFloat(t.getAttribute('y') || '0'))
            .filter((y) => !Number.isNaN(y) && y > 0);
          const maxY = yCoords.length > 0 ? Math.max(...yCoords) : 0;
          xAxisTexts = allTexts.filter((t) => {
            const val = (t.textContent || '').replace(/\s+/g, ' ').trim();
            if (!val) return false;
            const yVal = parseFloat(t.getAttribute('y') || '0');
            const isBottomBand = maxY > 0 && yVal >= maxY - 18;
            const looksLikeXLabel =
              /kini|pekan|minggu|tunai|transfer|izin|pelanggaran|sakit|sarpras|agenda|laundry|masak|petugas|\d{1,2}\/\d{1,2}|\b(jan|feb|mar|apr|mei|jun|jul|agu|ags|sep|okt|nov|des)\b/i.test(
                val
              );
            return isBottomBand && (looksLikeXLabel || !/^\d+$/.test(val));
          });
        }

        const isSixSeries = xAxisTexts.length === 6;
        xAxisTexts.forEach((txtEl, idx) => {
          const raw = (txtEl.textContent || '').replace(/\s+/g, ' ').trim();
          const compacted = compactChartDateLabel(raw, isSixSeries && idx === xAxisTexts.length - 1);
          if (compacted && compacted !== raw) {
            const tspan = txtEl.querySelector('tspan');
            if (tspan && txtEl.children.length === 1) {
              tspan.textContent = compacted;
            } else {
              txtEl.textContent = compacted;
            }
          }
          txtEl.setAttribute('data-siap-xaxis-label', 'true');
          txtEl.style.fontSize = '9pt';
          txtEl.style.whiteSpace = 'nowrap';
          txtEl.querySelectorAll<SVGElement>('tspan').forEach((sp) => {
            sp.setAttribute('data-siap-xaxis-label', 'true');
            sp.style.fontSize = '9pt';
            sp.style.whiteSpace = 'nowrap';
          });
        });
      });

      // 2. HTML bar / flex / grid charts
      const htmlLabelRows = Array.from(
        chartCard.querySelectorAll<HTMLElement>('[class*="grid-cols-"], [class*="flex"]')
      ).filter((row) => {
        if (row.closest('svg')) return false;
        const kids = Array.from(row.children) as HTMLElement[];
        if (kids.length < 2 || kids.length > 8) return false;
        const hasNestedBarOrHeading = kids.some((k) => Boolean(k.querySelector('h3, h4, h5, svg')));
        if (hasNestedBarOrHeading) return false;
        const texts = kids.map((k) => (k.textContent || '').replace(/\s+/g, ' ').trim());
        return texts.some((t) =>
          /kini|pekan|minggu|tunai|transfer|izin|pelanggaran|sakit|sarpras|agenda|laundry|masak|petugas|\d{1,2}\/\d{1,2}|\b(jan|feb|mar|apr|mei|jun|jul|agu|ags|sep|okt|nov|des)\b/i.test(
            t
          )
        );
      });

      htmlLabelRows.forEach((row) => {
        const kids = Array.from(row.children) as HTMLElement[];
        const isSixSeries = kids.length === 6;
        kids.forEach((kid, idx) => {
          const leafTarget =
            kid.children.length === 1 && kid.firstElementChild instanceof HTMLElement
              ? (kid.firstElementChild as HTMLElement)
              : kid;
          const raw = (leafTarget.textContent || '').replace(/\s+/g, ' ').trim();
          const compacted = compactChartDateLabel(raw, isSixSeries && idx === kids.length - 1);
          if (compacted && compacted !== raw && leafTarget.children.length === 0) {
            leafTarget.textContent = compacted;
          }
          leafTarget.setAttribute('data-siap-xaxis-label', 'true');
          leafTarget.classList.add('whitespace-nowrap');
          leafTarget.style.fontSize = '9pt';
          leafTarget.style.whiteSpace = 'nowrap';
        });
      });

      // 3. Per-column HTML bar cards (setiap kolom punya bar + label bawah)
      const colGrids = Array.from(
        chartCard.querySelectorAll<HTMLElement>('[class*="grid-cols-6"], [class*="grid-cols-5"], [class*="grid-cols-4"]')
      );
      colGrids.forEach((grid) => {
        const cols = Array.from(grid.children) as HTMLElement[];
        if (cols.length < 4) return;
        const isSixSeries = cols.length === 6;
        cols.forEach((col, idx) => {
          const spans = Array.from(col.querySelectorAll<HTMLElement>('span, p, div')).filter(
            (el) =>
              el.children.length === 0 &&
              (el.textContent || '').trim().length > 0 &&
              !el.getAttribute('style')?.includes('height')
          );
          const bottomLabel = spans[spans.length - 1];
          if (!bottomLabel) return;
          const raw = (bottomLabel.textContent || '').replace(/\s+/g, ' ').trim();
          if (
            /kini|pekan|minggu|tunai|transfer|izin|pelanggaran|sakit|sarpras|agenda|laundry|\d{1,2}\/\d{1,2}|\b(jan|feb|mar|apr|mei|jun|jul|agu|ags|sep|okt|nov|des)\b/i.test(
              raw
            )
          ) {
            const compacted = compactChartDateLabel(raw, isSixSeries && idx === cols.length - 1);
            if (compacted && compacted !== raw) {
              bottomLabel.textContent = compacted;
            }
            bottomLabel.setAttribute('data-siap-xaxis-label', 'true');
            bottomLabel.classList.add('whitespace-nowrap');
            bottomLabel.style.fontSize = '9pt';
            bottomLabel.style.whiteSpace = 'nowrap';
          }
        });
      });
    };

    const insertAfterHeaderOrSummary = (sectionEl: HTMLElement, blockEl: HTMLElement) => {
      const children = Array.from(sectionEl.children) as HTMLElement[];
      const kpiGrid = children.find((ch) => {
        if (ch.tagName === 'TABLE') return false;
        const cls = ch.className || '';
        return /\bgrid\b/.test(cls) && ch.querySelectorAll('strong, [class*="font-extrabold"]').length >= 2;
      });
      if (kpiGrid) {
        kpiGrid.insertAdjacentElement('afterend', blockEl);
        return;
      }
      const headerBlock = children.find((ch) => Boolean(ch.querySelector('h2, h3')));
      if (headerBlock) {
        headerBlock.insertAdjacentElement('afterend', blockEl);
        return;
      }
      const firstTableWrap = children.find((ch) => ch.tagName === 'TABLE' || Boolean(ch.querySelector('table')));
      if (firstTableWrap) {
        sectionEl.insertBefore(blockEl, firstTableWrap);
        return;
      }
      sectionEl.appendChild(blockEl);
    };

    // Cari seluruh kartu grafik di area Ringkasan Eksekutif (sebelum Bab I..X)
    const chartSearchScope: HTMLElement | null = execSectionEl || searchContainer;
    if (chartSearchScope) {
      const CHART_TITLE_RX =
        /perbandingan\s+keuangan|tunai\s*(?:&|dan)\s*transfer|tren\s*6\s*(?:pekan|minggu)|perbandingan\s+(?:persentase\s+)?kedisiplinan|perbandingan\s+aktivitas\s+divisi/i;

      const isOutsideDivisions = (el: HTMLElement): boolean => {
        if (approvalEl && (el === approvalEl || approvalEl.contains(el) || el.contains(approvalEl))) {
          return false;
        }
        if (outermostDivSections.some((d) => el === d || d.contains(el) || el.contains(d))) {
          return false;
        }
        return true;
      };

      const titleNodes = Array.from(
        chartSearchScope.querySelectorAll<HTMLElement>('h3, h4, h5, p, div, span')
      ).filter((el) => {
        if (!isOutsideDivisions(el)) return false;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 110) return false;
        if (el.querySelector('svg')) return false;
        const hasChildMatch = Array.from(el.children).some((ch) =>
          CHART_TITLE_RX.test((ch.textContent || '').replace(/\s+/g, ' ').trim())
        );
        return !hasChildMatch && CHART_TITLE_RX.test(t);
      });

      const resolvedCards: HTMLElement[] = [];
      for (const titleEl of titleNodes) {
        let cur: HTMLElement | null = titleEl.parentElement;
        let bestCard: HTMLElement | null = null;
        while (cur && cur !== chartSearchScope && cur !== searchContainer) {
          if (!isOutsideDivisions(cur)) break;
          const containedTitles = titleNodes.filter((tn) => cur!.contains(tn));
          if (containedTitles.length > 1) break;
          const fullT = (cur.textContent || '').replace(/\s+/g, ' ').trim();
          if (/Ringkasan\s+Eksekutif/i.test(fullT) && fullT.length > 400) break;
          if (fullT.length > 4500) break;
          const cls = typeof cur.className === 'string' ? cur.className : '';
          if (/\bborder\b|\brounded|\bbg-/.test(cls) && hasChartVisual(cur)) {
            bestCard = cur;
          }
          cur = cur.parentElement;
        }
        if (bestCard && !resolvedCards.includes(bestCard)) {
          resolvedCards.push(bestCard);
        }
      }

      // Fallback scan bila ada kartu grafik lain di execSectionEl
      if (execSectionEl) {
        const rawChartEls = Array.from(
          execSectionEl.querySelectorAll<HTMLElement>('div, section')
        ).filter((el) => {
          if (el === execSectionEl) return false;
          if (!isOutsideDivisions(el)) return false;
          const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (!txt || txt.length > 4500) return false;
          if (/Ringkasan\s+Eksekutif/i.test(txt) && txt.length > 600) return false;
          const cls = typeof el.className === 'string' ? el.className : '';
          const looksLikeCard = /\bborder\b|\brounded|\bbg-/.test(cls);
          const hasTitle = Boolean(
            el.querySelector('h3, h4, h5, p, [class*="font-bold"], [class*="font-semibold"]')
          );
          return looksLikeCard && hasTitle && hasChartVisual(el);
        });

        const singleChartCandidates = rawChartEls.filter((cand) => {
          const titledChildren = rawChartEls.filter((other) => {
            if (other === cand || !cand.contains(other)) return false;
            const firstT = (other.textContent || '').replace(/\s+/g, ' ').trim();
            return CHART_TITLE_RX.test(firstT) || Boolean(other.querySelector('h3, h4, h5'));
          });
          const topNested = titledChildren.filter(
            (n) => !titledChildren.some((p) => p !== n && p.contains(n))
          );
          return topNested.length < 2;
        });

        singleChartCandidates
          .filter((cand) => !singleChartCandidates.some((other) => other !== cand && other.contains(cand)))
          .forEach((cand) => {
            if (
              !resolvedCards.some(
                (rc) => rc === cand || rc.contains(cand) || cand.contains(rc)
              )
            ) {
              resolvedCards.push(cand);
            }
          });
      }

      const financeCards: HTMLElement[] = [];
      const disciplineCards: HTMLElement[] = [];
      const activityCards: HTMLElement[] = [];
      const otherExtraExecCharts: HTMLElement[] = [];

      for (const card of resolvedCards) {
        card.setAttribute('data-siap-chart-card', 'true');
        const txt = (card.textContent || '').replace(/\s+/g, ' ').trim();
        const isActivity =
          /aktivitas\s+divisi/i.test(txt) ||
          (/izin\s+pulang/i.test(txt) &&
            (/pelanggaran/i.test(txt) || /sarpras/i.test(txt) || /laundry/i.test(txt)));
        if (isActivity) {
          activityCards.push(card);
          continue;
        }
        const isFinance =
          /perbandingan\s+keuangan/i.test(txt) ||
          (/tunai/i.test(txt) && /transfer/i.test(txt)) ||
          /tren\s*6\s*(?:pekan|minggu)/i.test(txt) ||
          /arus\s*kas|pemasukan.*pengeluaran/i.test(txt);
        const isDiscipline =
          /kedisiplinan/i.test(txt) ||
          /masak\s+tepat\s+waktu/i.test(txt) ||
          /petugas\s+dapur/i.test(txt) ||
          (/jamaah/i.test(txt) && /dapur/i.test(txt));

        if (isFinance) {
          financeCards.push(card);
        } else if (isDiscipline) {
          disciplineCards.push(card);
        } else {
          otherExtraExecCharts.push(card);
        }
      }

      // 0b-1. Sembunyikan grafik keuangan di Ringkasan Eksekutif & kloning ke Bab II. Laporan Keuangan Pesantren
      if (financeCards.length > 0) {
        financeCards.forEach((c) => c.setAttribute('data-siap-hidden-chart', 'true'));
        if (div2El) {
          const finWrap = document.createElement('div');
          finWrap.setAttribute('data-siap-chart-clone', 'true');
          finWrap.className = `my-4 grid grid-cols-1 ${
            financeCards.length > 1 ? 'md:grid-cols-2 print:grid-cols-2' : ''
          } gap-4 break-inside-avoid`;
          financeCards.forEach((orig) => {
            const clone = orig.cloneNode(true) as HTMLElement;
            clone.removeAttribute('data-siap-hidden-chart');
            clone.setAttribute('data-siap-card-styled', 'true');
            clone.setAttribute('data-siap-chart-card', 'true');
            clone.classList.add('rounded-xl', 'overflow-hidden', 'border', 'border-slate-200');
            normalizeSvgForClone(clone);
            formatChartXAxisLabels(clone);
            finWrap.appendChild(clone);
          });
          insertAfterHeaderOrSummary(div2El, finWrap);
        }
      }

      // 0b-2. Sembunyikan grafik kedisiplinan campuran di Ringkasan Eksekutif & kloning versi khusus Dapur ke Bab VIII. Dapur Umum & Konsumsi Santri
      if (disciplineCards.length > 0) {
        disciplineCards.forEach((c) => c.setAttribute('data-siap-hidden-chart', 'true'));
        if (div8El) {
          const dapurWrap = document.createElement('div');
          dapurWrap.setAttribute('data-siap-chart-clone', 'true');
          dapurWrap.className = `my-4 grid grid-cols-1 ${
            disciplineCards.length > 1 ? 'md:grid-cols-2 print:grid-cols-2' : ''
          } gap-4 break-inside-avoid`;

          disciplineCards.forEach((orig) => {
            const clone = orig.cloneNode(true) as HTMLElement;
            clone.removeAttribute('data-siap-hidden-chart');
            clone.setAttribute('data-siap-card-styled', 'true');
            clone.setAttribute('data-siap-chart-card', 'true');
            clone.classList.add('rounded-xl', 'overflow-hidden', 'border', 'border-slate-200');

            // Hapus baris/elemen Jamaah dari grafik Dapur
            const rowsToStrip = Array.from(clone.querySelectorAll<HTMLElement>('div, li, tr')).filter(
              (item) => {
                if (item === clone) return false;
                const t = (item.textContent || '').replace(/\s+/g, ' ').trim();
                const hasJamaah = /\bjamaah\b|\bsholat\b/i.test(t);
                const hasDapur = /\bdapur\b|\bmasak\b|\bpetugas\b/i.test(t);
                return hasJamaah && !hasDapur && t.length < 180;
              }
            );
            const outermostStrips = rowsToStrip.filter(
              (cand) => !rowsToStrip.some((other) => other !== cand && other.contains(cand))
            );
            outermostStrips.forEach((r) => r.remove());

            // Hapus grup SVG Jamaah jika grafik memakai SVG
            clone.querySelectorAll('svg g').forEach((gEl) => {
              const gt = (gEl.textContent || '').replace(/\s+/g, ' ').trim();
              if (/\bjamaah\b|\bsholat\b/i.test(gt) && !/\bdapur\b|\bmasak\b|\bpetugas\b/i.test(gt) && gt.length < 120) {
                gEl.remove();
              }
            });

            // Perbarui judul kartu jika menyebut Jamaah
            clone.querySelectorAll('h3, h4, h5, p').forEach((hdr) => {
              const ht = (hdr.textContent || '').trim();
              if (/kedisiplinan/i.test(ht) && (/jamaah/i.test(ht) || /persentase/i.test(ht))) {
                hdr.textContent = 'Kedisiplinan Operasional Dapur (Masak & Petugas)';
              } else if (/jamaah/i.test(ht) && /dapur/i.test(ht)) {
                hdr.textContent = ht.replace(/jamaah\s*(?:&|dan)?\s*/gi, '').trim();
              }
            });

            normalizeSvgForClone(clone);
            formatChartXAxisLabels(clone);
            dapurWrap.appendChild(clone);
          });

          insertAfterHeaderOrSummary(div8El, dapurWrap);
        }
      }

      // Sembunyikan juga grafik sisa di Ringkasan Eksekutif agar tersisa HANYA 1 grafik "Perbandingan Aktivitas Divisi"
      otherExtraExecCharts.forEach((c) => c.setAttribute('data-siap-hidden-chart', 'true'));

      // Sembunyikan grid pembungkus jika seluruh anaknya tersembunyi
      [...financeCards, ...disciplineCards, ...otherExtraExecCharts].forEach((hiddenCard) => {
        const p = hiddenCard.parentElement;
        if (!p || p === execSectionEl || p === searchContainer) return;
        const visibleKids = Array.from(p.children).filter(
          (ch) => !ch.hasAttribute('data-siap-hidden-chart')
        );
        if (visibleKids.length === 0) {
          p.setAttribute('data-siap-hidden-chart', 'true');
        }
      });

      // 0b-3. Pastikan grafik gabungan "Perbandingan Aktivitas Divisi" melebar penuh rapi di Ringkasan Eksekutif
      activityCards.forEach((actCard) => {
        actCard.setAttribute('data-siap-full-span', 'true');
        actCard.setAttribute('data-siap-card-styled', 'true');
        actCard.classList.add('rounded-xl', 'overflow-hidden', 'border', 'border-slate-200');
        formatChartXAxisLabels(actCard);
      });
    }

    // Rapikan label sumbu X pada grafik lain di seluruh dokumen (termasuk grafik Koperasi & PSB)
    searchContainer
      .querySelectorAll<HTMLElement>('[data-siap-chart-card="true"]')
      .forEach((card) => {
        if (!card.hasAttribute('data-siap-hidden-chart')) {
          formatChartXAxisLabels(card);
        }
      });

    // 1. Ganti blok Struktur Personalia (Divisi Administrasi) dengan susunan baku & hapus struktur lama ganda
    const administrasiVisible =
      !isExtraKey(scope) &&
      (scope === 'gabungan'
        ? baseSelectedDivisions.includes('administrasi')
        : scope === 'administrasi');

    if (administrasiVisible) {
      const adminScopeEl = div1ScopeEl || searchContainer;

      // 1a. Sinkronkan angka kartu Pengurus Aktif (18 orang: Kepala Pondok ke bawah, kecuali Pengasuh, Dewan Pengasuh/Dzurriyah, Direktur Pendidikan)
      if (pengurusRows.length > 0) {
        const updatePengurusCardInScope = (rootEl: HTMLElement | null) => {
          if (!rootEl) return;
          const cards = Array.from(rootEl.querySelectorAll<HTMLElement>('div')).filter((d) => {
            if (d.closest('[data-siap-personalia-clone="true"]')) return false;
            const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
            return /Pengurus\s+Aktif/i.test(t) && t.length < 180;
          });
          const innerCards = cards.filter(
            (cand) => !cards.some((other) => other !== cand && cand.contains(other))
          );
          innerCards.forEach((card) => {
            const numNodes = Array.from(
              card.querySelectorAll<HTMLElement>('strong, b, p, span, div')
            ).filter((n) => {
              if (n.children.length > 0) return false;
              const nt = (n.textContent || '').replace(/\s+/g, ' ').trim();
              return /^\d+(?:\s*Orang)?$/i.test(nt);
            });
            numNodes.forEach((n) => {
              const nt = (n.textContent || '').replace(/\s+/g, ' ').trim();
              if (!n.hasAttribute('data-siap-orig-text')) {
                n.setAttribute('data-siap-orig-text', n.textContent || '');
              }
              n.textContent = /orang/i.test(nt)
                ? `${pengurusAktifCount} Orang`
                : String(pengurusAktifCount);
            });
          });
        };
        updatePengurusCardInScope(adminScopeEl);
        updatePengurusCardInScope(execSectionEl);
      }

      if (personaliaSource) {
        const adminEls = Array.from(adminScopeEl.querySelectorAll('*')) as HTMLElement[];
        const headingMatches = adminEls.filter((el) => {
          if (el.closest('[data-siap-personalia-clone="true"]')) return false;
          if (approvalEl && (el === approvalEl || approvalEl.contains(el))) return false;
          const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
          return (
            txt.length > 0 &&
            txt.length < 140 &&
            /struktur\s+(personalia|kepengurusan|pengurus)|personalia\s+pengurus|susunan\s+(pengurus|personalia|kepengurusan)|daftar\s+(pengurus|personalia)/i.test(
              txt
            )
          );
        });
        const headingEl = headingMatches[0] || null;

        let cloneWrap: HTMLElement | null = null;
        if (headingEl && headingEl.parentElement) {
          cloneWrap = document.createElement('div');
          cloneWrap.setAttribute('data-siap-personalia-clone', 'true');
          cloneWrap.setAttribute('data-siap-page-start', 'true');
          cloneWrap.className = 'break-before-page print:break-before-page';
          cloneWrap.innerHTML = personaliaSource.innerHTML;

          const parent = headingEl.parentElement;
          const parentText = (parent.textContent || '').replace(/\s+/g, ' ');
          const isDedicatedWrapper =
            parent !== adminScopeEl &&
            parent !== searchContainer &&
            parentText.length < 25000 &&
            !/Santri\s+Aktif|\bDivisi\s+I\b|Ringkasan\s+Eksekutif|Daftar\s+Kamar/i.test(parentText);

          if (isDedicatedWrapper && parent.parentElement) {
            parent.setAttribute('data-siap-hidden-personalia', 'true');
            parent.parentElement.insertBefore(cloneWrap, parent);
          } else {
            headingEl.setAttribute('data-siap-hidden-personalia', 'true');
            parent.insertBefore(cloneWrap, headingEl);
          }
        } else {
          const fallbackCandidates = adminEls.filter((el) => {
            if (el === adminScopeEl || el === searchContainer) return false;
            if (approvalEl && (el === approvalEl || el.contains(approvalEl) || approvalEl.contains(el))) {
              return false;
            }
            const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (txt.length === 0 || txt.length > 25000) return false;
            if (/Santri\s+Aktif|Ringkasan\s+Eksekutif|Lembar\s+Pengesahan|Daftar\s+Kamar|\bDivisi\s+(I|II|III)\b/i.test(txt)) {
              return false;
            }
            return (
              (txt.includes('Pengasuh Pondok') ||
                txt.includes('Dewan Pengasuh') ||
                txt.includes('Direktur Pendidikan') ||
                txt.includes('DEWAN HARIAN') ||
                txt.includes('Dewan Harian')) &&
              txt.includes('Kepala Pondok')
            );
          });
          const outermostFallback = fallbackCandidates.find(
            (cand) => !fallbackCandidates.some((other) => other !== cand && other.contains(cand))
          );
          if (outermostFallback && outermostFallback.parentElement) {
            cloneWrap = document.createElement('div');
            cloneWrap.setAttribute('data-siap-personalia-clone', 'true');
            cloneWrap.setAttribute('data-siap-page-start', 'true');
            cloneWrap.className = 'break-before-page print:break-before-page';
            cloneWrap.innerHTML = personaliaSource.innerHTML;
            outermostFallback.setAttribute('data-siap-hidden-personalia', 'true');
            outermostFallback.parentElement.insertBefore(cloneWrap, outermostFallback);
          }
        }

        // Sapu bersih blok struktur lama ganda
        const postScanEls = Array.from(adminScopeEl.querySelectorAll('div, section, table')) as HTMLElement[];
        const duplicateOldBlocks = postScanEls.filter((el) => {
          if (el === adminScopeEl || el === searchContainer) return false;
          if (el.closest('[data-siap-personalia-clone="true"]')) return false;
          if (cloneWrap && (el === cloneWrap || el.contains(cloneWrap))) return false;
          if (el.closest('[data-siap-hidden-personalia="true"]')) return false;
          if (approvalEl && (el === approvalEl || el.contains(approvalEl) || approvalEl.contains(el))) {
            return false;
          }
          const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (txt.length === 0 || txt.length > 25000) return false;
          if (
            /\bDivisi\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)\b|Ringkasan\s+Eksekutif|Daftar\s+Kamar|Santri\s+Aktif|Santri\s+Ndalem|Mutasi\s+Santri/i.test(
              txt
            )
          ) {
            return false;
          }
          return (
            /\bI\.\s*DEWAN\s*HARIAN\b/i.test(txt) ||
            /\bII\.\s*PLENO\b/i.test(txt) ||
            /Dewan\s+Pengasuh\s*\(Dzurriyah\)|Direktur\s+Pendidikan|Pengasuh\s+Pondok/i.test(txt) ||
            (/Kepala\s+Pondok/i.test(txt) && /Sekretaris/i.test(txt) && /Bendahara/i.test(txt))
          );
        });
        for (const oldBlk of duplicateOldBlocks) {
          oldBlk.setAttribute('data-siap-hidden-personalia', 'true');
        }
      }

      // 1b. Susun daftar 21 kamar ke dalam 2 tabel terpisah yang simetris:
      // Tabel Kiri: 1-11 (Kamar A1-A10 dan C1) | Tabel Kanan: 12-21 (Kamar C2-C6, Tahfidz, Al-Fachriyah 1-4 VIP)
      const kamarTables = Array.from(adminScopeEl.querySelectorAll('table')).filter((tbl) => {
        if (tbl.closest('[data-siap-personalia-clone="true"]')) return false;
        if (tbl.closest('[data-siap-hidden-personalia="true"]')) return false;
        if (tbl.closest('[data-siap-kamar-grid="true"]')) return false;
        const headTxt = (tbl.querySelector('thead')?.textContent || '').toLowerCase();
        const bodyRows = Array.from(tbl.querySelectorAll('tbody tr'));
        if (bodyRows.length < 3) return false;
        const bodyTxt = (tbl.querySelector('tbody')?.textContent || '').toLowerCase();
        return (
          headTxt.includes('kamar') &&
          !headTxt.includes('jabatan') &&
          !headTxt.includes('musyrif') &&
          !headTxt.includes('mutasi') &&
          !headTxt.includes('nama santri') &&
          (bodyTxt.includes('a1') ||
            bodyTxt.includes('tahfidz') ||
            bodyTxt.includes('fachriyah') ||
            bodyRows.length >= 6)
        );
      });

      const primaryKamarTable = kamarTables[0] || null;
      if (primaryKamarTable) {
        const origThead = primaryKamarTable.querySelector('thead');
        const origTfoot = primaryKamarTable.querySelector('tfoot');
        const headCells = origThead
          ? Array.from(origThead.querySelectorAll('th, td')).map((c) =>
              (c.textContent || '').replace(/\s+/g, ' ').trim()
            )
          : [];
        const noColIdx = headCells.findIndex((t) => /^no\.?$/i.test(t));
        const detectedKamarCol = headCells.findIndex((t) => /kamar/i.test(t));

        const allCollectedRows: HTMLTableRowElement[] = [];
        kamarTables.forEach((tbl) => {
          tbl.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((r) => {
            allCollectedRows.push(r);
          });
        });

        const totalRows: HTMLTableRowElement[] = [];
        const roomRows: Array<{ row: HTMLTableRowElement; name: string }> = [];
        allCollectedRows.forEach((r) => {
          const cells = Array.from(r.querySelectorAll('td, th')).map((c) =>
            (c.textContent || '').replace(/\s+/g, ' ').trim()
          );
          const rowText = (r.textContent || '').replace(/\s+/g, ' ').trim();
          const firstCell = cells[0] || '';
          if (/^(total|jumlah\s+seluruh|grand\s+total)\b/i.test(firstCell) || /^total\b/i.test(rowText)) {
            totalRows.push(r);
          } else {
            const roomName =
              (detectedKamarCol >= 0 ? cells[detectedKamarCol] : '') ||
              cells.find((c) => c && !/^\d+\.?$/.test(c)) ||
              firstCell;
            if (roomName) {
              roomRows.push({ row: r, name: roomName });
            }
          }
        });

        if (roomRows.length >= 4) {
          const getKamarRank = (rawName: string): { side: 'left' | 'right'; order: number } => {
            const norm = rawName.replace(/\s+/g, ' ').trim();
            const aMatch = norm.match(/^(?:kamar\s*)?A\s*(\d+)\b/i);
            if (aMatch) {
              const num = Number(aMatch[1]);
              if (num >= 1 && num <= 10) return { side: 'left', order: num };
              return { side: 'left', order: 100 + num };
            }
            const cMatch = norm.match(/^(?:kamar\s*)?C\s*(\d+)\b/i);
            if (cMatch) {
              const cNum = Number(cMatch[1]);
              if (cNum === 1) return { side: 'left', order: 11 };
              return { side: 'right', order: 10 + cNum };
            }
            if (/tahfidz/i.test(norm)) {
              return { side: 'right', order: 100 };
            }
            const vipMatch = norm.match(/(?:al-?\s*fachriyah|fachriyah|vip)\s*(\d+)?/i);
            if (vipMatch) {
              const vipNum = vipMatch[1] ? Number(vipMatch[1]) : 9;
              return { side: 'right', order: 200 + vipNum };
            }
            return { side: 'right', order: 500 };
          };

          let leftEntries = roomRows
            .filter((item) => getKamarRank(item.name).side === 'left')
            .sort((a, b) => getKamarRank(a.name).order - getKamarRank(b.name).order);
          let rightEntries = roomRows
            .filter((item) => getKamarRank(item.name).side === 'right')
            .sort((a, b) => {
              const diff = getKamarRank(a.name).order - getKamarRank(b.name).order;
              return diff !== 0 ? diff : a.name.localeCompare(b.name, 'id', { numeric: true });
            });

          if (leftEntries.length === 0 || rightEntries.length === 0) {
            const mid = Math.ceil(roomRows.length / 2);
            leftEntries = roomRows.slice(0, mid);
            rightEntries = roomRows.slice(mid);
          }

          const buildHalfTable = (rows: HTMLTableRowElement[], startNo: number) => {
            const tbl = document.createElement('table');
            tbl.className = 'w-full border-collapse';
            tbl.setAttribute('data-siap-compact-table', 'true');
            if (origThead) {
              const clonedHead = origThead.cloneNode(true) as HTMLTableSectionElement;
              const headRow = clonedHead.querySelector('tr');
              if (headRow && noColIdx === -1) {
                const thNo = document.createElement('th');
                thNo.className = 'px-2 py-1 border border-slate-200 bg-slate-100 text-slate-700 text-center w-9';
                thNo.textContent = 'No';
                headRow.insertBefore(thNo, headRow.firstChild);
              }
              tbl.appendChild(clonedHead);
            }
            const tbody = document.createElement('tbody');
            rows.forEach((r, idx) => {
              const rowClone = r.cloneNode(true) as HTMLTableRowElement;
              const rowNum = String(startNo + idx);
              if (noColIdx >= 0) {
                const cells = rowClone.querySelectorAll('td, th');
                if (cells[noColIdx]) {
                  cells[noColIdx].textContent = rowNum;
                }
              } else {
                const tdNo = document.createElement('td');
                tdNo.className = 'px-2 py-1 border border-slate-200 text-center font-mono tabular-nums text-slate-600 w-9';
                tdNo.textContent = rowNum;
                rowClone.insertBefore(tdNo, rowClone.firstChild);
              }
              tbody.appendChild(rowClone);
            });
            tbl.appendChild(tbody);
            return tbl;
          };

          const kamarOuter = document.createElement('div');
          kamarOuter.setAttribute('data-siap-kamar-grid', 'true');
          kamarOuter.className = 'my-3 space-y-2.5 break-inside-avoid';

          const kamarGrid = document.createElement('div');
          kamarGrid.className = 'grid grid-cols-2 gap-4 items-start';

          const leftWrap = document.createElement('div');
          leftWrap.className =
            'min-w-0 rounded-xl overflow-hidden border border-slate-200 bg-white siap-table-card';
          leftWrap.appendChild(buildHalfTable(leftEntries.map((e) => e.row), 1));

          const rightWrap = document.createElement('div');
          rightWrap.className =
            'min-w-0 rounded-xl overflow-hidden border border-slate-200 bg-white siap-table-card';
          rightWrap.appendChild(
            buildHalfTable(
              rightEntries.map((e) => e.row),
              leftEntries.length + 1
            )
          );

          kamarGrid.appendChild(leftWrap);
          kamarGrid.appendChild(rightWrap);
          kamarOuter.appendChild(kamarGrid);

          const summarySourceRow = totalRows[0] || origTfoot?.querySelector('tr') || null;
          if (summarySourceRow) {
            const cells = Array.from(summarySourceRow.querySelectorAll('td, th')).map((c) =>
              (c.textContent || '').replace(/\s+/g, ' ').trim()
            );
            const labelTxt = cells[0] || 'Total Seluruh Santri';
            const valueTxt = cells.slice(1).filter(Boolean).join(' · ');
            const totalBar = document.createElement('div');
            totalBar.setAttribute('data-siap-kamar-total', 'true');
            totalBar.className =
              'rounded-xl overflow-hidden border border-slate-200 bg-slate-50 px-4 py-2 flex items-center justify-between gap-2 font-bold text-slate-900';
            const lblSpan = document.createElement('span');
            lblSpan.textContent = labelTxt;
            const valSpan = document.createElement('span');
            valSpan.className = 'tabular-nums';
            valSpan.textContent = valueTxt;
            totalBar.appendChild(lblSpan);
            totalBar.appendChild(valSpan);
            kamarOuter.appendChild(totalBar);
          }

          kamarTables.forEach((tbl, idx) => {
            const pWrap = tbl.parentElement;
            const isSingleScrollWrap =
              pWrap &&
              pWrap !== adminScopeEl &&
              pWrap.children.length === 1 &&
              /overflow/i.test(pWrap.className || '');

            if (idx === 0) {
              if (isSingleScrollWrap && pWrap.parentElement) {
                pWrap.parentElement.insertBefore(kamarOuter, pWrap);
              } else if (pWrap) {
                pWrap.insertBefore(kamarOuter, tbl);
              }
            }
            if (isSingleScrollWrap) {
              pWrap.setAttribute('data-siap-hidden-kamar', 'true');
            } else {
              tbl.setAttribute('data-siap-hidden-kamar', 'true');
            }
          });
        }
      }
    }

    // 1c. Bab II (Laporan Keuangan Pesantren): Sinkronkan kartu & rincian Tunggakan Syahriyah (aktif saja, cutoff tgl 25, bebas bulan lunas)
    if (div2El && extraRaw.santriRows.length > 0) {
      const syncTunggakanCard = (scopeEl: HTMLElement | null) => {
        if (!scopeEl) return;
        const cardEls = Array.from(scopeEl.querySelectorAll<HTMLElement>('div')).filter((d) => {
          if (d.closest('[data-siap-tunggakan-clone="true"]')) return false;
          const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
          return /Tunggakan\s*Syahriyah|Estimasi\s*Tunggakan/i.test(t) && t.length < 220;
        });
        const innerCards = cardEls.filter(
          (cand) => !cardEls.some((other) => other !== cand && cand.contains(other))
        );
        innerCards.forEach((card) => {
          const leafNodes = Array.from(
            card.querySelectorAll<HTMLElement>('strong, b, p, span, div')
          ).filter((n) => n.children.length === 0);
          leafNodes.forEach((n) => {
            const nt = (n.textContent || '').replace(/\s+/g, ' ').trim();
            if (/^Rp[\s\d.,]+$/i.test(nt)) {
              if (!n.hasAttribute('data-siap-orig-text')) {
                n.setAttribute('data-siap-orig-text', n.textContent || '');
              }
              n.textContent = formatRupiah(syahriyahTunggakan.totalNominal);
            } else if (/^\d+\s*santri(?:\s*\(\s*\d+\s*bulan\s*\))?$/i.test(nt)) {
              if (!n.hasAttribute('data-siap-orig-text')) {
                n.setAttribute('data-siap-orig-text', n.textContent || '');
              }
              n.textContent = /\bbulan\b/i.test(nt)
                ? `${syahriyahTunggakan.totalSantriMenunggak} santri (${syahriyahTunggakan.totalBulanMenunggak} bulan)`
                : `${syahriyahTunggakan.totalSantriMenunggak} santri`;
            } else if (/\d+\s*santri/i.test(nt) && nt.length < 90) {
              if (!n.hasAttribute('data-siap-orig-text')) {
                n.setAttribute('data-siap-orig-text', n.textContent || '');
              }
              n.textContent = nt
                .replace(/\d+\s*santri/gi, `${syahriyahTunggakan.totalSantriMenunggak} santri`)
                .replace(/\d+\s*bulan/gi, `${syahriyahTunggakan.totalBulanMenunggak} bulan`);
            }
          });
        });
      };

      syncTunggakanCard(div2El);
      syncTunggakanCard(execSectionEl);

      if (tunggakanTableSource) {
        const tunggakanTables = Array.from(div2El.querySelectorAll('table')).filter((tbl) => {
          const headTxt = (tbl.querySelector('thead')?.textContent || '').toLowerCase();
          const prevTxt = (tbl.previousElementSibling?.textContent || '').toLowerCase();
          return (
            headTxt.includes('tunggakan') ||
            headTxt.includes('menunggak') ||
            (headTxt.includes('syahriyah') && headTxt.includes('santri')) ||
            prevTxt.includes('tunggakan')
          );
        });

        const tunggakanClone = document.createElement('div');
        tunggakanClone.setAttribute('data-siap-tunggakan-clone', 'true');
        tunggakanClone.className = 'mt-3';
        tunggakanClone.innerHTML = tunggakanTableSource.innerHTML;

        if (tunggakanTables.length > 0) {
          tunggakanTables.forEach((tbl, idx) => {
            const pWrap = tbl.parentElement;
            const isSingleWrap =
              pWrap &&
              pWrap !== div2El &&
              pWrap.children.length === 1 &&
              /overflow|rounded|border/i.test(pWrap.className || '');
            if (idx === 0) {
              if (isSingleWrap && pWrap.parentElement) {
                pWrap.parentElement.insertBefore(tunggakanClone, pWrap);
              } else if (pWrap) {
                pWrap.insertBefore(tunggakanClone, tbl);
              }
            }
            if (isSingleWrap) {
              pWrap.setAttribute('data-siap-hidden-tunggakan', 'true');
            } else {
              tbl.setAttribute('data-siap-hidden-tunggakan', 'true');
            }
          });
        }
      }
    }

    // 2. Bab III (Kegiatan Pondok): Tampilkan "LAMPIRAN DOKUMENTASI FOTO KEGIATAN" cukup 1 kali saja (hapus duplikasi)
    if (div3El) {
      const fotoTitleEls = Array.from(
        div3El.querySelectorAll<HTMLElement>('h3, h4, h5, p, div, span')
      ).filter((el) => {
        if (el.closest('[data-siap-kegiatan-foto-clone="true"]')) return false;
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!txt || txt.length > 100) return false;
        const hasChildMatch = Array.from(el.children).some((ch) =>
          /lampiran\s+dokumentasi\s+foto\s+kegiatan|dokumentasi\s+foto\s+kegiatan/i.test(
            (ch.textContent || '').replace(/\s+/g, ' ').trim()
          )
        );
        return (
          !hasChildMatch &&
          /^(?:lampiran\s+)?dokumentasi\s+foto\s+kegiatan\b/i.test(txt)
        );
      });

      const existingFotoBlocks: HTMLElement[] = [];
      for (const titleEl of fotoTitleEls) {
        let cur: HTMLElement | null = titleEl;
        let bestBlock: HTMLElement = titleEl;
        while (cur && cur !== div3El) {
          const fullTxt = (cur.textContent || '').replace(/\s+/g, ' ').trim();
          if (
            /\bDivisi\s+III\b|Pengisi\s+Acara|Agenda\s+Kegiatan|Notulensi\s+Kegiatan/i.test(fullTxt)
          ) {
            break;
          }
          if (fullTxt.length > 20000) break;
          bestBlock = cur;
          cur = cur.parentElement;
        }
        if (bestBlock !== div3El && !existingFotoBlocks.includes(bestBlock)) {
          existingFotoBlocks.push(bestBlock);
        }
      }
      const outermostFotoBlocks = existingFotoBlocks.filter(
        (cand) => !existingFotoBlocks.some((other) => other !== cand && other.contains(cand))
      );

      if (kegiatanFotoSource && kegiatanLampiranFoto.length > 0) {
        // Sembunyikan seluruh blok duplikat bawaan dokumen utama agar hanya tampil 1x dari sumber lengkap
        outermostFotoBlocks.forEach((blk) => {
          blk.setAttribute('data-siap-hidden-kegiatan-foto', 'true');
        });

        const fotoClone = document.createElement('div');
        fotoClone.setAttribute('data-siap-kegiatan-foto-clone', 'true');
        fotoClone.className = 'mt-5 pt-4 border-t border-slate-200 space-y-3';
        fotoClone.innerHTML = kegiatanFotoSource.innerHTML;

        const pengisiCandidates = Array.from(div3El.querySelectorAll('table, div, section')).filter(
          (el) => {
            if (el === div3El) return false;
            if (el.closest('[data-siap-hidden-kegiatan-foto="true"]')) return false;
            const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
            return (
              /Pengisi\s+Acara|Rincian\s+Pengisi|Daftar\s+Pengisi/i.test(txt) &&
              txt.length < 15000
            );
          }
        );
        const outermostPengisi = pengisiCandidates.filter(
          (cand) => !pengisiCandidates.some((other) => other !== cand && other.contains(cand))
        );
        const lastPengisiBlock = outermostPengisi[outermostPengisi.length - 1] || null;
        if (lastPengisiBlock) {
          lastPengisiBlock.insertAdjacentElement('afterend', fotoClone);
        } else {
          div3El.appendChild(fotoClone);
        }
      } else if (outermostFotoBlocks.length > 1) {
        outermostFotoBlocks.slice(1).forEach((blk) => {
          blk.setAttribute('data-siap-hidden-kegiatan-foto', 'true');
        });
      }
    }

    // 2b. Lengkapi tabel rincian Bab IV. Perizinan Pulang Santri menjadi 8 kolom berurutan
    if (div4El && perizinanTableSource) {
      const izinClone = document.createElement('div');
      izinClone.setAttribute('data-siap-perizinan-clone', 'true');
      izinClone.className = 'mt-3';
      izinClone.innerHTML = perizinanTableSource.innerHTML;

      const existingIzinTables = Array.from(div4El.querySelectorAll('table'));
      if (existingIzinTables.length > 0) {
        existingIzinTables.forEach((tbl, idx) => {
          const pWrap = tbl.parentElement;
          const isSingleWrap =
            pWrap &&
            pWrap !== div4El &&
            pWrap.children.length === 1 &&
            /overflow|rounded|border/i.test(pWrap.className || '');
          if (idx === 0) {
            if (isSingleWrap && pWrap.parentElement) {
              pWrap.parentElement.insertBefore(izinClone, pWrap);
            } else if (pWrap) {
              pWrap.insertBefore(izinClone, tbl);
            }
          }
          if (isSingleWrap) {
            pWrap.setAttribute('data-siap-hidden-perizinan', 'true');
          } else {
            tbl.setAttribute('data-siap-hidden-perizinan', 'true');
          }
        });
      } else {
        div4El.querySelectorAll('p').forEach((p) => {
          const pt = (p.textContent || '').trim();
          if (/belum\s+ada|tidak\s+ada/i.test(pt) && /izin|pulang/i.test(pt)) {
            p.setAttribute('data-siap-hidden-perizinan', 'true');
          }
        });
        div4El.appendChild(izinClone);
      }
    }

    // 2c. Bab VIII (Dapur Umum & Konsumsi Santri): Pastikan kolom Menu Ringkas tampil sebagai teks biasa (tanpa $ atau format rumus matematika)
    if (div8El) {
      div8El.querySelectorAll('table').forEach((tbl) => {
        const heads = Array.from(tbl.querySelectorAll('thead th, thead td')).map((h) =>
          (h.textContent || '').trim().toLowerCase()
        );
        const menuColIdx = heads.findIndex((h) => h.includes('menu'));
        tbl.querySelectorAll<HTMLElement>('tbody tr').forEach((tr) => {
          const cells = Array.from(tr.children) as HTMLElement[];
          const targetCells =
            menuColIdx >= 0 && cells[menuColIdx] ? [cells[menuColIdx]] : cells;
          targetCells.forEach((cell) => {
            const hasMathDom = Boolean(
              cell.querySelector('.katex, .MathJax, math, annotation')
            );
            if (hasMathDom) {
              const ann = cell.querySelector('annotation');
              const rawMenu = (ann?.textContent || cell.textContent || '')
                .replace(/^\s*\$+|\$+\s*$/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              if (!cell.hasAttribute('data-siap-orig-text')) {
                cell.setAttribute('data-siap-orig-text', cell.textContent || '');
              }
              cell.textContent = rawMenu || '-';
            } else {
              const rawCellTxt = (cell.textContent || '').trim();
              if (/^\s*\$[\s\S]*\$\s*$/.test(rawCellTxt) || (menuColIdx >= 0 && rawCellTxt.includes('$'))) {
                const cleanedMenu = rawCellTxt
                  .replace(/\$([^$]*[A-Za-z+][^$]*)\$/g, '$1')
                  .replace(/^\s*\$+|\$+\s*$/g, '')
                  .trim();
                if (cleanedMenu !== rawCellTxt) {
                  if (!cell.hasAttribute('data-siap-orig-text')) {
                    cell.setAttribute('data-siap-orig-text', cell.textContent || '');
                  }
                  cell.textContent = cleanedMenu;
                }
              }
            }
            if (menuColIdx >= 0 && cells[menuColIdx] === cell) {
              cell.style.fontStyle = 'normal';
              cell.style.fontFamily = 'inherit';
            }
          });
        });
      });

      const d8Walker = document.createTreeWalker(div8El, NodeFilter.SHOW_TEXT);
      const d8Nodes: Text[] = [];
      let d8Cur = d8Walker.nextNode();
      while (d8Cur) {
        if (d8Cur.nodeValue && /\$([^$]*[A-Za-z+][^$]*)\$/.test(d8Cur.nodeValue)) {
          d8Nodes.push(d8Cur as Text);
        }
        d8Cur = d8Walker.nextNode();
      }
      d8Nodes.forEach((n) => {
        if (n.nodeValue) {
          n.nodeValue = n.nodeValue.replace(/\$([^$]*[A-Za-z+][^$]*)\$/g, '$1');
        }
      });
    }

    // 3. Tempel blok Divisi XI, XII, XIII ke dalam kontainer kertas laporan utama
    const shouldInjectExtrasInsidePaper =
      scope === 'gabungan' &&
      baseSelectedDivisions.length > 0 &&
      extraSelectedDivisions.length > 0 &&
      Boolean(extraSource);

    if (shouldInjectExtrasInsidePaper && extraSource) {
      const lastBaseDivEl =
        outermostDivSections[outermostDivSections.length - 1] || null;

      const extraWrap = document.createElement('div');
      extraWrap.setAttribute('data-siap-extra-clone', 'true');
      extraWrap.setAttribute('data-siap-laporan-doc', 'true');
      extraWrap.className = 'mt-6 space-y-6 print:mt-0 print:space-y-0';
      extraWrap.innerHTML = extraSource.innerHTML;

      if (
        lastBaseDivEl &&
        (!approvalEl ||
          Boolean(
            lastBaseDivEl.compareDocumentPosition(approvalEl) &
              Node.DOCUMENT_POSITION_FOLLOWING
          ))
      ) {
        lastBaseDivEl.insertAdjacentElement('afterend', extraWrap);
      } else if (approvalEl && approvalEl.parentElement) {
        approvalEl.parentElement.insertBefore(extraWrap, approvalEl);
      } else {
        searchContainer.appendChild(extraWrap);
      }
    }

    // 4. Seragamkan sudut agak lengkung (rounded-xl overflow-hidden border) pada seluruh kartu & tabel laporan
    searchContainer.querySelectorAll<HTMLTableElement>('table').forEach((tbl) => {
      if (tbl.closest('[data-siap-hidden-personalia="true"]')) return;
      if (tbl.closest('[data-siap-hidden-approval="true"]')) return;
      if (tbl.closest('[data-siap-hidden-kamar="true"]')) return;
      if (tbl.closest('[data-siap-hidden-tunggakan="true"]')) return;
      if (tbl.closest('[data-siap-hidden-kegiatan-foto="true"]')) return;
      if (tbl.closest('[data-siap-hidden-chart="true"]')) return;
      if (tbl.closest('.siap-table-card')) return;
      tbl.setAttribute('data-siap-table-styled', 'true');
      const pWrap = tbl.parentElement;
      if (
        pWrap &&
        pWrap !== searchContainer &&
        pWrap.children.length === 1 &&
        /overflow|rounded|border/i.test(pWrap.className || '')
      ) {
        pWrap.setAttribute('data-siap-table-wrap', 'true');
        pWrap.classList.add('rounded-xl', 'overflow-hidden', 'border', 'border-slate-200');
      }
    });

    searchContainer.querySelectorAll<HTMLElement>('div, section').forEach((el) => {
      if (el === searchContainer) return;
      if (el.closest('[data-siap-hidden-personalia="true"]')) return;
      if (el.closest('[data-siap-hidden-approval="true"]')) return;
      if (el.closest('[data-siap-hidden-kamar="true"]')) return;
      if (el.closest('[data-siap-hidden-tunggakan="true"]')) return;
      if (el.closest('[data-siap-hidden-kegiatan-foto="true"]')) return;
      if (el.closest('[data-siap-hidden-chart="true"]')) return;
      const cls = el.className || '';
      if (
        typeof cls === 'string' &&
        /\bborder\b/.test(cls) &&
        !/\brounded-full\b/.test(cls) &&
        !/\bprint:border-0\b/.test(cls)
      ) {
        el.setAttribute('data-siap-card-styled', 'true');
        el.classList.add('rounded-xl', 'overflow-hidden');
      }
    });

    // 5. Pastikan tidak ada teks laporan di bawah 11pt (14.67px), kecuali label sumbu X grafik (9pt)
    enforceReportFontFloor(searchContainer);

    return cleanupDomPatches;
  }, [
    loading,
    bundle,
    scope,
    baseSelectedDivisions,
    extraSelectedDivisions,
    showCoverAndApproval,
    showNotaLampiran,
    useDigitalSignature,
    pengaturanApproval,
    todayStr,
    mobilePreviewOpen,
    strukturPersonalia,
    pengurusAktifCount,
    pengurusRows.length,
    extraRaw.santriRows.length,
    syahriyahTunggakan,
    extraReports,
    perizinanReportRows,
    kegiatanLampiranFoto,
  ]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  const handleToggleDivision = (key: ExtendedDivisionKey) => {
    setSelectedDivisions((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const handleDownloadExcel = () => {
    if (!bundle) return;
    if (isExtraKey(scope)) {
      const wb = XLSX.utils.book_new();
      if (scope === 'kebersihan') {
        const rows =
          extraReports.kebersihan.detail.length > 0
            ? extraReports.kebersihan.detail.map((d, i) => ({
                No: i + 1,
                Tanggal: d.tanggal,
                Area_Kamar: d.area,
                Tugas_Petugas: d.tugas,
                Status: d.status,
              }))
            : [{ Keterangan: 'Belum ada data piket kebersihan pada periode ini.' }];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Kebersihan & Piket');
        XLSX.writeFile(wb, `Laporan-Kebersihan-${todayStr || 'export'}.xlsx`);
      } else if (scope === 'koperasi') {
        const rows =
          extraReports.koperasi.detail.length > 0
            ? extraReports.koperasi.detail.map((d, i) => ({
                No: i + 1,
                Tanggal: d.tanggal,
                Keterangan: d.keterangan,
                Jenis: d.jenis,
                Nominal: d.isKeluar ? -d.nominal : d.nominal,
              }))
            : [{ Keterangan: 'Belum ada transaksi koperasi pada periode ini.' }];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Koperasi Pondok');
        XLSX.writeFile(wb, `Laporan-Koperasi-${todayStr || 'export'}.xlsx`);
      } else {
        const rows =
          extraReports.psb.detail.length > 0
            ? extraReports.psb.detail.map((d, i) => ({
                No: i + 1,
                Tanggal_Daftar: d.tanggal,
                No_Registrasi: d.noReg,
                Nama_Calon_Santri: d.nama,
                Program_Asal: d.program,
                Status: d.status,
              }))
            : [{ Keterangan: 'Belum ada pendaftar PSB pada periode ini.' }];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'PSB Pendaftaran');
        XLSX.writeFile(wb, `Laporan-PSB-${todayStr || 'export'}.xlsx`);
      }
      return;
    }
    const baseScope: LaporanScope = scope;
    const baseDivs =
      baseSelectedDivisions.length > 0 ? baseSelectedDivisions : BASE_DIV_KEYS;
    exportLaporanToExcel(bundle, baseScope, baseDivs);
  };

  const renderExtraDivisionSections = () => {
    const hasBeforeXi =
      showCoverAndApproval || (scope === 'gabungan' && baseSelectedDivisions.length > 0);
    const hasBeforeXii =
      hasBeforeXi || (scope === 'gabungan' && extraSelectedDivisions.includes('kebersihan'));
    const hasBeforeXiii =
      hasBeforeXii || (scope === 'gabungan' && extraSelectedDivisions.includes('koperasi'));

    return (
      <>
        {(scope === 'kebersihan' ||
          (scope === 'gabungan' && extraSelectedDivisions.includes('kebersihan'))) && (
          <section
            data-siap-page-start={hasBeforeXi ? 'true' : undefined}
            className={`bg-white border border-slate-200 rounded-xl overflow-hidden p-6 sm:p-8 space-y-4 print:border-slate-300 ${
              hasBeforeXi ? 'print:break-before-page' : ''
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11pt] font-bold uppercase tracking-wider text-emerald-700">
                  Divisi XI · Kebersihan &amp; Piket
                </span>
                <h3 className="text-[14pt] font-extrabold text-slate-900">
                  Laporan Kebersihan Lingkungan &amp; Piket Kamar
                </h3>
              </div>
              <span className="text-[11pt] text-slate-600 font-medium">
                {periodWindow?.label}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11pt]">
              <div className="p-3 rounded-xl overflow-hidden bg-slate-50 border border-slate-200">
                <span className="text-slate-600 block">Total Jadwal / Tugas</span>
                <strong className="text-[14pt] font-extrabold text-slate-900 tabular-nums">
                  {extraReports.kebersihan.totalTugas}
                </strong>
                <span className="text-[11pt] text-slate-500 block">
                  Periode lalu: {extraReports.kebersihan.prevTotalTugas}
                </span>
              </div>
              <div className="p-3 rounded-xl overflow-hidden bg-emerald-50 border border-emerald-200">
                <span className="text-emerald-800 block">Selesai / Bersih</span>
                <strong className="text-[14pt] font-extrabold text-emerald-950 tabular-nums">
                  {extraReports.kebersihan.selesai}
                </strong>
              </div>
              <div className="p-3 rounded-xl overflow-hidden bg-amber-50 border border-amber-200">
                <span className="text-amber-800 block">Belum / Evaluasi</span>
                <strong className="text-[14pt] font-extrabold text-amber-950 tabular-nums">
                  {extraReports.kebersihan.belum}
                </strong>
              </div>
              <div className="p-3 rounded-xl overflow-hidden bg-slate-50 border border-slate-200">
                <span className="text-slate-600 block">Tingkat Kepatuhan</span>
                <strong className="text-[14pt] font-extrabold text-slate-900 tabular-nums">
                  {extraReports.kebersihan.persenBersih}%
                </strong>
              </div>
            </div>

            {extraReports.kebersihan.detail.length === 0 ? (
              <p className="text-[12pt] text-slate-600 italic py-2">
                Belum ada catatan piket atau tugas kebersihan tercatat pada periode ini.
              </p>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                <table className="w-full text-[11pt] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="px-2.5 py-1.5 border border-slate-200">Tanggal</th>
                      <th className="px-2.5 py-1.5 border border-slate-200">Area / Kamar</th>
                      <th className="px-2.5 py-1.5 border border-slate-200">Tugas / Petugas</th>
                      <th className="px-2.5 py-1.5 border border-slate-200">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraReports.kebersihan.detail.map((row, i) => (
                      <tr key={i}>
                        <td className="px-2.5 py-1.5 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                          {row.tanggal}
                        </td>
                        <td className="px-2.5 py-1.5 border border-slate-200 font-semibold text-slate-800">
                          {row.area}
                        </td>
                        <td className="px-2.5 py-1.5 border border-slate-200 text-slate-700">{row.tugas}</td>
                        <td className="px-2.5 py-1.5 border border-slate-200 font-semibold text-slate-800">
                          {row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {(scope === 'koperasi' ||
          (scope === 'gabungan' && extraSelectedDivisions.includes('koperasi'))) && (
          <section
            data-siap-page-start={hasBeforeXii ? 'true' : undefined}
            className={`bg-white border border-slate-200 rounded-xl overflow-hidden p-6 sm:p-8 space-y-4 print:border-slate-300 ${
              hasBeforeXii ? 'print:break-before-page' : ''
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11pt] font-bold uppercase tracking-wider text-emerald-700">
                  Divisi XII · Koperasi Pondok
                </span>
                <h3 className="text-[14pt] font-extrabold text-slate-900">
                  Laporan Operasional &amp; Arus Kas Koperasi
                </h3>
              </div>
              <span className="text-[11pt] text-slate-600 font-medium">
                {periodWindow?.label}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11pt]">
              <div className="p-3 rounded-xl overflow-hidden bg-emerald-50 border border-emerald-200">
                <span className="text-emerald-800 block">Pemasukan / Penjualan</span>
                <strong className="text-[13pt] font-extrabold text-emerald-950 tabular-nums">
                  {formatRupiah(extraReports.koperasi.pemasukan)}
                </strong>
                <span className="text-[11pt] text-emerald-700 block">
                  Lalu: {formatRupiah(extraReports.koperasi.prevPemasukan)}
                </span>
              </div>
              <div className="p-3 rounded-xl overflow-hidden bg-rose-50 border border-rose-200">
                <span className="text-rose-800 block">Pengeluaran / Kulaan</span>
                <strong className="text-[13pt] font-extrabold text-rose-950 tabular-nums">
                  {formatRupiah(extraReports.koperasi.pengeluaran)}
                </strong>
              </div>
              <div className="p-3 rounded-xl overflow-hidden bg-slate-50 border border-slate-200">
                <span className="text-slate-600 block">Surplus Periode</span>
                <strong className="text-[13pt] font-extrabold text-slate-900 tabular-nums">
                  {formatRupiah(extraReports.koperasi.surplus)}
                </strong>
              </div>
              <div className="p-3 rounded-xl overflow-hidden bg-slate-50 border border-slate-200">
                <span className="text-slate-600 block">Transaksi &amp; Produk</span>
                <strong className="text-[13pt] font-extrabold text-slate-900 tabular-nums">
                  {extraReports.koperasi.totalTransaksi} Trx · {extraReports.koperasi.totalProduk} Item
                </strong>
              </div>
            </div>

            {/* Grafik Batang Tren Omset Koperasi (6 Pekan Terakhir) */}
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50/60 p-4 space-y-3 break-inside-avoid">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-[12pt] font-extrabold text-slate-900">
                    Tren Omset Koperasi (6 Pekan Terakhir)
                  </h4>
                  <p className="text-[11pt] text-slate-600">
                    Total omset 6 pekan: <strong className="text-slate-900 tabular-nums">{formatRupiah(extraReports.koperasi.totalOmset6Pekan)}</strong>
                  </p>
                </div>
                <span className="text-[11pt] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1 tabular-nums">
                  Rata-rata: {formatCompactRupiah(Math.round(extraReports.koperasi.totalOmset6Pekan / 6))}/pekan
                </span>
              </div>

              <div className="grid grid-cols-6 gap-2 sm:gap-3 items-end pt-2">
                {extraReports.koperasi.weeklyOmset.map((wk) => {
                  const pct =
                    wk.omset > 0
                      ? Math.max(10, Math.round((wk.omset / extraReports.koperasi.maxOmset6Pekan) * 100))
                      : 0;
                  return (
                    <div key={wk.label} className="flex flex-col items-center gap-1.5 min-w-0">
                      <span className="text-[11pt] font-bold text-slate-800 tabular-nums text-center leading-tight">
                        {formatCompactRupiah(wk.omset)}
                      </span>
                      <div className="w-full h-32 rounded-xl bg-white border border-slate-200 flex items-end justify-center p-1.5 overflow-hidden">
                        {wk.omset > 0 ? (
                          <div
                            className="w-full rounded-lg bg-emerald-600 transition-all"
                            style={{ height: `${pct}%` }}
                          />
                        ) : (
                          <div className="w-full h-1 rounded-full bg-slate-200" />
                        )}
                      </div>
                      <span
                        data-siap-xaxis-label="true"
                        className="block text-[9pt] whitespace-nowrap font-semibold text-slate-700 text-center leading-tight"
                      >
                        {wk.shortLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {extraReports.koperasi.detail.length === 0 ? (
              <p className="text-[12pt] text-slate-600 italic py-2">
                Belum ada transaksi koperasi tercatat pada periode ini.
              </p>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                <table className="w-full text-[11pt] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="px-2.5 py-1.5 border border-slate-200">Tanggal</th>
                      <th className="px-2.5 py-1.5 border border-slate-200">Keterangan / Barang</th>
                      <th className="px-2.5 py-1.5 border border-slate-200">Jenis / Metode</th>
                      <th className="px-2.5 py-1.5 border border-slate-200 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraReports.koperasi.detail.map((row, i) => (
                      <tr key={i}>
                        <td className="px-2.5 py-1.5 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                          {row.tanggal}
                        </td>
                        <td className="px-2.5 py-1.5 border border-slate-200 font-semibold text-slate-800">
                          {row.keterangan}
                        </td>
                        <td className="px-2.5 py-1.5 border border-slate-200 text-slate-700">{row.jenis}</td>
                        <td
                          className={`px-2.5 py-1.5 border border-slate-200 text-right font-mono font-bold tabular-nums ${
                            row.isKeluar ? 'text-rose-700' : 'text-emerald-800'
                          }`}
                        >
                          {row.isKeluar ? '-' : '+'}
                          {formatRupiah(row.nominal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {(scope === 'psb' ||
          (scope === 'gabungan' && extraSelectedDivisions.includes('psb'))) && (
          <section
            data-siap-page-start={hasBeforeXiii ? 'true' : undefined}
            className={`bg-white border border-slate-200 rounded-xl overflow-hidden p-4 sm:p-5 space-y-2.5 print:border-slate-300 print:space-y-2 ${
              hasBeforeXiii ? 'print:break-before-page' : ''
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <span className="text-[11pt] font-bold uppercase tracking-wider text-emerald-700">
                  Divisi XIII · Pendaftaran Santri Baru (PSB)
                </span>
                <h3 className="text-[13pt] font-extrabold text-slate-900 leading-tight">
                  Laporan Penerimaan &amp; Verifikasi Calon Santri Baru
                </h3>
              </div>
              <span className="text-[11pt] text-slate-600 font-medium">
                {periodWindow?.label}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11pt]">
              <div className="px-2.5 py-2 rounded-xl overflow-hidden bg-slate-50 border border-slate-200">
                <span className="text-slate-600 block leading-tight">Pendaftar Periode Ini</span>
                <strong className="text-[13pt] font-extrabold text-slate-900 tabular-nums leading-tight">
                  {extraReports.psb.pendaftarPeriode}
                </strong>
                <span className="text-[11pt] text-slate-500 block leading-tight">
                  Total: {extraReports.psb.totalSemua} (Lalu: {extraReports.psb.prevPendaftar})
                </span>
              </div>
              <div className="px-2.5 py-2 rounded-xl overflow-hidden bg-emerald-50 border border-emerald-200">
                <span className="text-emerald-800 block leading-tight">Terverifikasi / Diterima</span>
                <strong className="text-[13pt] font-extrabold text-emerald-950 tabular-nums leading-tight">
                  {extraReports.psb.terverifikasi}
                </strong>
              </div>
              <div className="px-2.5 py-2 rounded-xl overflow-hidden bg-amber-50 border border-amber-200">
                <span className="text-amber-800 block leading-tight">Menunggu / Proses</span>
                <strong className="text-[13pt] font-extrabold text-amber-950 tabular-nums leading-tight">
                  {extraReports.psb.menunggu}
                </strong>
              </div>
              <div className="px-2.5 py-2 rounded-xl overflow-hidden bg-slate-50 border border-slate-200">
                <span className="text-slate-600 block leading-tight">Pembayaran Masuk PSB</span>
                <strong className="text-[12pt] font-extrabold text-slate-900 tabular-nums leading-tight">
                  {formatRupiah(extraReports.psb.totalBayar)}
                </strong>
              </div>
            </div>

            {/* Banner Indikator Sisa Kuota Diskon Pangkal (100 Kuota Pertama) */}
            <div className="rounded-xl overflow-hidden border border-emerald-200 bg-emerald-50/70 px-3 py-2 space-y-1.5 break-inside-avoid">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-[11pt] font-extrabold text-emerald-950 leading-snug">
                    Sisa Kuota Diskon Pangkal (dari {extraReports.psb.kuotaMaks} Kuota Pertama)
                  </h4>
                  <p className="text-[11pt] text-emerald-900 leading-snug">
                    Terpakai: <strong className="tabular-nums">{extraReports.psb.kuotaTerpakai}</strong> dari{' '}
                    <strong className="tabular-nums">{extraReports.psb.kuotaMaks}</strong> terverifikasi / aktif ({extraReports.psb.persenKuota}%)
                  </p>
                </div>
                <div className="rounded-xl overflow-hidden border border-emerald-300 bg-white px-3 py-1 text-right">
                  <span className="block text-[11pt] text-emerald-700 font-semibold leading-tight">Sisa Kuota</span>
                  <strong className="text-[13pt] font-extrabold text-emerald-900 tabular-nums leading-tight">
                    {extraReports.psb.sisaKuota} Kuota
                  </strong>
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-white border border-emerald-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${extraReports.psb.persenKuota}%` }}
                />
              </div>
            </div>

            {/* Grafik Batang Tren Pendaftaran Santri Baru (6 Pekan Terakhir) */}
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50/60 px-3 py-2 space-y-1.5 break-inside-avoid">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-[11pt] font-extrabold text-slate-900 leading-snug">
                    Tren Pendaftaran Santri Baru (6 Pekan Terakhir)
                  </h4>
                  <p className="text-[11pt] text-slate-600 leading-snug">
                    Total 6 pekan terakhir:{' '}
                    <strong className="text-slate-900 tabular-nums">
                      {extraReports.psb.weeklyTrend.reduce((acc, w) => acc + w.total, 0)} Santri
                    </strong>
                  </p>
                </div>
                <span className="text-[11pt] font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-2.5 py-0.5 tabular-nums">
                  Terverifikasi: {extraReports.psb.weeklyTrend.reduce((acc, w) => acc + w.verif, 0)}
                </span>
              </div>

              <div className="grid grid-cols-6 gap-2 items-end pt-1">
                {extraReports.psb.weeklyTrend.map((wk) => {
                  const pct =
                    wk.total > 0
                      ? Math.max(14, Math.round((wk.total / extraReports.psb.maxTrend) * 100))
                      : 0;
                  return (
                    <div key={wk.label} className="flex flex-col items-center gap-1 min-w-0">
                      <span className="text-[11pt] font-bold text-slate-800 tabular-nums text-center leading-tight">
                        {wk.total} Org
                      </span>
                      <div className="w-full h-14 rounded-xl bg-white border border-slate-200 flex items-end justify-center p-1 overflow-hidden">
                        {wk.total > 0 ? (
                          <div
                            className="w-full rounded-lg bg-emerald-600 transition-all"
                            style={{ height: `${pct}%` }}
                          />
                        ) : (
                          <div className="w-full h-1 rounded-full bg-slate-200" />
                        )}
                      </div>
                      <span
                        data-siap-xaxis-label="true"
                        className="block text-[9pt] whitespace-nowrap font-semibold text-slate-700 text-center leading-tight"
                      >
                        {wk.shortLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {extraReports.psb.detail.length === 0 ? (
              <p className="text-[12pt] text-slate-600 italic py-2">
                Belum ada pendaftaran santri baru tercatat pada periode ini.
              </p>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                <table className="w-full text-[11pt] border-collapse" data-siap-compact-table="true">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="px-2 py-1 border border-slate-200">Tanggal</th>
                      <th className="px-2 py-1 border border-slate-200">No. Reg</th>
                      <th className="px-2 py-1 border border-slate-200">Nama Calon Santri</th>
                      <th className="px-2 py-1 border border-slate-200">Program / Asal</th>
                      <th className="px-2 py-1 border border-slate-200">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraReports.psb.detail.map((row, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                          {row.tanggal}
                        </td>
                        <td className="px-2 py-1 border border-slate-200 font-mono font-semibold text-slate-700 whitespace-nowrap">
                          {row.noReg}
                        </td>
                        <td className="px-2 py-1 border border-slate-200 font-semibold text-slate-900">
                          {row.nama}
                        </td>
                        <td className="px-2 py-1 border border-slate-200 text-slate-700">
                          {row.program}
                        </td>
                        <td
                          className={`px-2 py-1 border border-slate-200 font-semibold whitespace-nowrap ${
                            /diterima|verif|lunas|aktif/i.test(row.status)
                              ? 'text-emerald-800'
                              : /ditolak|batal/i.test(row.status)
                              ? 'text-rose-700'
                              : 'text-amber-800'
                          }`}
                        >
                          {row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 print:max-w-none print:space-y-0">
      {/* Aturan Cetak A4 untuk PDF Bersih */}
      <style jsx global>{`
        [data-siap-hidden-personalia="true"],
        [data-siap-hidden-approval="true"],
        [data-siap-hidden-kamar="true"],
        [data-siap-hidden-perizinan="true"],
        [data-siap-hidden-tunggakan="true"],
        [data-siap-hidden-kegiatan-foto="true"],
        [data-siap-hidden-chart="true"] {
          display: none !important;
        }
        [data-siap-hidden-signature="true"] {
          visibility: hidden !important;
          opacity: 0 !important;
        }
        [data-siap-full-span="true"] {
          grid-column: 1 / -1 !important;
          width: 100% !important;
        }
        #pusat-laporan-dokumen,
        [data-siap-laporan-doc="true"] {
          font-size: 12pt !important;
          line-height: 1.45 !important;
        }
        #pusat-laporan-dokumen p,
        #pusat-laporan-dokumen li,
        #pusat-laporan-dokumen blockquote,
        [data-siap-laporan-doc="true"] p,
        [data-siap-laporan-doc="true"] li {
          font-size: 12pt !important;
          line-height: 1.45 !important;
        }
        #pusat-laporan-dokumen [data-siap-approval="true"],
        #pusat-laporan-dokumen [data-siap-approval="true"] p,
        #pusat-laporan-dokumen [data-siap-approval="true"] div,
        #pusat-laporan-dokumen [data-siap-approval="true"] span,
        [data-siap-laporan-doc="true"] [data-siap-approval="true"],
        [data-siap-laporan-doc="true"] [data-siap-approval="true"] p,
        [data-siap-laporan-doc="true"] [data-siap-approval="true"] div,
        [data-siap-laporan-doc="true"] [data-siap-approval="true"] span {
          font-size: 12pt !important;
          line-height: 1.45 !important;
        }
        #pusat-laporan-dokumen table:not([data-siap-izin-table="true"]),
        #pusat-laporan-dokumen table:not([data-siap-izin-table="true"]) th,
        #pusat-laporan-dokumen table:not([data-siap-izin-table="true"]) td,
        [data-siap-laporan-doc="true"] table:not([data-siap-izin-table="true"]),
        [data-siap-laporan-doc="true"] table:not([data-siap-izin-table="true"]) th,
        [data-siap-laporan-doc="true"] table:not([data-siap-izin-table="true"]) td {
          font-size: 11pt !important;
          line-height: 1.35 !important;
        }
        #pusat-laporan-dokumen table:not([data-siap-izin-table="true"]) th,
        #pusat-laporan-dokumen table:not([data-siap-izin-table="true"]) td,
        [data-siap-laporan-doc="true"] table:not([data-siap-izin-table="true"]) th,
        [data-siap-laporan-doc="true"] table:not([data-siap-izin-table="true"]) td {
          padding: 5px 7px !important;
        }
        #pusat-laporan-dokumen table[data-siap-izin-table="true"],
        [data-siap-laporan-doc="true"] table[data-siap-izin-table="true"] {
          table-layout: fixed !important;
          width: 100% !important;
          font-size: 10.5pt !important;
        }
        #pusat-laporan-dokumen table[data-siap-izin-table="true"] th,
        #pusat-laporan-dokumen table[data-siap-izin-table="true"] td,
        [data-siap-laporan-doc="true"] table[data-siap-izin-table="true"] th,
        [data-siap-laporan-doc="true"] table[data-siap-izin-table="true"] td {
          font-size: 10.5pt !important;
          line-height: 1.3 !important;
          padding: 4px 5px !important;
          overflow-wrap: anywhere;
        }
        [data-siap-kamar-grid="true"] table th,
        [data-siap-kamar-grid="true"] table td,
        [data-siap-compact-table="true"] th,
        [data-siap-compact-table="true"] td {
          padding: 3.5px 6px !important;
        }
        #pusat-laporan-dokumen svg text:not([data-siap-xaxis-label="true"]),
        #pusat-laporan-dokumen svg tspan:not([data-siap-xaxis-label="true"]),
        [data-siap-laporan-doc="true"] svg text:not([data-siap-xaxis-label="true"]),
        [data-siap-laporan-doc="true"] svg tspan:not([data-siap-xaxis-label="true"]) {
          font-size: 11pt !important;
        }
        [data-siap-xaxis-label="true"],
        #pusat-laporan-dokumen [data-siap-xaxis-label="true"],
        [data-siap-laporan-doc="true"] [data-siap-xaxis-label="true"] {
          font-size: 9pt !important;
          white-space: nowrap !important;
        }
        #pusat-laporan-dokumen svg,
        [data-siap-laporan-doc="true"] svg {
          overflow: visible !important;
        }
        #pusat-laporan-dokumen [data-siap-card-styled="true"],
        [data-siap-laporan-doc="true"] [data-siap-card-styled="true"] {
          border-radius: 0.75rem !important;
          overflow: hidden !important;
        }
        .siap-table-card,
        #pusat-laporan-dokumen [data-siap-table-wrap="true"],
        [data-siap-laporan-doc="true"] [data-siap-table-wrap="true"] {
          border-radius: 0.75rem !important;
          overflow: hidden !important;
          border: 1px solid #e2e8f0 !important;
        }
        .siap-table-card > table,
        #pusat-laporan-dokumen [data-siap-table-wrap="true"] > table,
        [data-siap-laporan-doc="true"] [data-siap-table-wrap="true"] > table {
          border-collapse: collapse !important;
          width: 100% !important;
          margin: 0 !important;
          border-style: hidden !important;
        }
        #pusat-laporan-dokumen table[data-siap-table-styled="true"]:not([data-siap-table-wrap="true"] > table),
        [data-siap-laporan-doc="true"] table[data-siap-table-styled="true"]:not([data-siap-table-wrap="true"] > table) {
          border-collapse: separate !important;
          border-spacing: 0 !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 0.75rem !important;
          overflow: hidden !important;
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 14mm;
          }
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #pusat-laporan-dokumen,
          [data-siap-laporan-doc="true"] {
            overflow: visible !important;
          }
          #pusat-laporan-dokumen [data-siap-card-styled="true"],
          [data-siap-laporan-doc="true"] [data-siap-card-styled="true"],
          .siap-table-card {
            border-radius: 0.75rem !important;
            border-color: #cbd5e1 !important;
          }
          [data-siap-kamar-grid="true"] .siap-table-card {
            overflow: hidden !important;
          }
          #pusat-laporan-dokumen [data-siap-table-wrap="true"],
          [data-siap-laporan-doc="true"] [data-siap-table-wrap="true"],
          #pusat-laporan-dokumen table[data-siap-table-styled="true"],
          [data-siap-laporan-doc="true"] table[data-siap-table-styled="true"] {
            overflow: visible !important;
            border-color: #cbd5e1 !important;
            border-radius: 0.75rem !important;
          }
          [data-siap-page-start="true"] {
            break-before: page !important;
            page-break-before: always !important;
          }
          thead {
            display: table-header-group;
          }
          tr,
          .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="print:hidden">
        <TransparencyBanner
          moduleLabel="Pusat Laporan Pondok"
          isReadOnly={!canEditLaporan}
          extraNote={
            !canViewBisyaroh
              ? 'Rincian & daftar Bisyaroh Pengurus disembunyikan sesuai kebijakan privasi.'
              : undefined
          }
        />
      </div>

      {/* ================================================================= */}
      {/* HEADER & TOMBOL EKSPOR (HIDDEN SAAT PRINT PDF)                    */}
      {/* ================================================================= */}
      <div className="print:hidden bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Pusat Laporan Pondok
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Laporan gabungan seluruh divisi & laporan per divisi siap cetak PDF atau ekspor Excel.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Perbarui Data
          </button>

          <button
            type="button"
            onClick={handleDownloadExcel}
            disabled={!bundle}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Unduh Excel (.xlsx)
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            disabled={!bundle}
            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 text-xs font-bold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            Cetak / Simpan PDF
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* PANEL FILTER PERIODE & CAKUPAN DIVISI (HIDDEN SAAT PRINT)         */}
      {/* ================================================================= */}
      <div className="print:hidden bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Kiri: Pemilihan Periode */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Calendar className="w-4 h-4 text-emerald-700" />
              <span>1. Pilih Periode Laporan</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 w-full p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('mingguan')}
                className={`w-full px-2 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap text-center cursor-pointer ${
                  mode === 'mingguan'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mingguan
              </button>
              <button
                type="button"
                onClick={() => setMode('bulanan')}
                className={`w-full px-2 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap text-center cursor-pointer ${
                  mode === 'bulanan'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bulanan
              </button>
              <button
                type="button"
                onClick={() => setMode('rentang')}
                className={`w-full px-2 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap text-center cursor-pointer ${
                  mode === 'rentang'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Rentang Tgl
              </button>
            </div>

            {mode === 'mingguan' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setAnchorDate((prev) => {
                      const base = prev || todayStr;
                      return base ? addDaysIso(base, -7) : prev;
                    })
                  }
                  aria-label="Pekan sebelumnya"
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <label htmlFor="laporan-anchor-date" className="text-xs text-slate-600">
                    Tgl Rapat (Akhir Pekan):
                  </label>
                  <input
                    id="laporan-anchor-date"
                    type="date"
                    value={anchorDate}
                    onChange={(e) => setAnchorDate(e.target.value)}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAnchorDate((prev) => {
                      const base = prev || todayStr;
                      return base ? addDaysIso(base, 7) : prev;
                    })
                  }
                  aria-label="Pekan berikutnya"
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (todayStr) setAnchorDate(getNearestFridayIso(todayStr));
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Pekan Jum&apos;at Ini
                </button>
              </div>
            )}

            {mode === 'bulanan' && (
              <div className="flex items-center gap-2 w-full">
                <label
                  htmlFor="laporan-month-input"
                  className="text-xs text-slate-600 whitespace-nowrap shrink-0"
                >
                  Pilih Bulan:
                </label>
                <input
                  id="laporan-month-input"
                  type="month"
                  value={monthStr}
                  onChange={(e) => setMonthStr(e.target.value)}
                  className="w-full min-w-[185px] min-h-[38px] px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-900 tabular-nums"
                />
              </div>
            )}

            {mode === 'rentang' && (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="laporan-range-start" className="text-xs text-slate-600">
                  Dari:
                </label>
                <input
                  id="laporan-range-start"
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-900"
                />
                <label htmlFor="laporan-range-end" className="text-xs text-slate-600">
                  Sampai:
                </label>
                <input
                  id="laporan-range-end"
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>
            )}

            {periodWindow ? (
              <p className="text-xs text-slate-500">
                Rentang aktif: <strong className="text-slate-800">{periodWindow.label}</strong> ·{' '}
                <span>{periodWindow.comparisonLabel}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-400">Menyiapkan rentang tanggal aktif...</p>
            )}
          </div>

          {/* Kanan: Jenis Laporan (Gabungan vs Per Divisi) */}
          <div className="space-y-3">
            <div className="space-y-2.5">
              <div className="w-full flex items-center gap-2 text-xs font-bold text-slate-700">
                <Layers className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>2. Pilih Cakupan Laporan</span>
              </div>

              <div className="space-y-2 w-full">
                <div className="grid grid-cols-2 gap-2 w-full">
                  <label className="w-full inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={showCoverAndApproval}
                      onChange={(e) => setShowCoverAndApproval(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 shrink-0"
                    />
                    <span className="truncate">Sampul &amp; Pengesahan</span>
                  </label>

                  <label className="w-full inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={showNotaLampiran}
                      onChange={(e) => setShowNotaLampiran(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 shrink-0"
                    />
                    <span className="truncate">
                      Lampiran Nota
                      {bundle ? ` (${bundle.keuangan.lampiranNotaList.length})` : ''}
                    </span>
                  </label>
                </div>

                <label className="w-full inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={useDigitalSignature}
                    onChange={(e) => setUseDigitalSignature(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 shrink-0"
                  />
                  <span>Pakai TTD &amp; Stempel Digital</span>
                </label>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-2">
              <span className="block text-[11px] font-semibold text-slate-600">
                Pilih Jenis Laporan:
              </span>
              <div className="grid grid-cols-2 w-full gap-1.5 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => setScope('gabungan')}
                  className={`col-span-2 sm:col-span-1 w-full sm:w-auto px-3 py-2 sm:py-1.5 text-xs font-bold rounded-lg border transition-colors text-center cursor-pointer ${
                    scope === 'gabungan'
                      ? 'bg-emerald-700 border-emerald-700 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Laporan Gabungan (Semua Divisi)
                </button>

                {ALL_DIVISIONS.map((div) => (
                  <button
                    key={div.key}
                    type="button"
                    onClick={() => setScope(div.key)}
                    className={`w-full sm:w-auto px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg border transition-colors text-left sm:text-center truncate cursor-pointer ${
                      scope === div.key
                        ? 'bg-emerald-700 border-emerald-700 text-white font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {div.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            {scope === 'gabungan' && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Divisi yang dimuat dalam Laporan Gabungan ({selectedDivisions.length}/{ALL_DIVISIONS.length}):
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDivisions(ALL_DIV_KEYS)}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline shrink-0 cursor-pointer"
                  >
                    Pilih Semua
                  </button>
                </div>
                <div className="grid grid-cols-2 w-full gap-x-3 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-4 sm:gap-y-1.5 text-xs text-slate-700">
                  {ALL_DIVISIONS.map((div) => (
                    <label key={div.key} className="inline-flex items-center gap-1.5 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedDivisions.includes(div.key)}
                        onChange={() => handleToggleDivision(div.key)}
                        className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 shrink-0"
                      />
                      <span className="truncate">{div.shortLabel}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* STATE LOADING / ERROR / PREVIEW DOKUMEN LAPORAN                   */}
      {/* ================================================================= */}
      {errorMsg && (
        <div className="print:hidden bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 text-sm">
          {errorMsg}
        </div>
      )}

      {loading || !bundle ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <div className="h-6 w-64 bg-slate-200 rounded animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
          </div>
          <div className="h-64 bg-slate-100 rounded-lg animate-pulse" />
        </div>
      ) : (
        <>
          {/* Ringkasan Eksekutif Khusus HP agar tidak langsung gulir dokumen A4 13.000px */}
          <div className="print:hidden lg:hidden space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-extrabold text-slate-900">
                  Ringkasan Eksekutif ({bundle.window.shortLabel})
                </h2>
                <span className="text-[11px] font-semibold text-emerald-700">
                  {scope === 'gabungan' ? `${selectedDivisions.length} Divisi` : scope.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-[11px] text-emerald-800">Pemasukan Keuangan</p>
                  <p className="text-sm font-extrabold text-emerald-950 tabular-nums mt-0.5">
                    {formatRupiah(bundle.keuangan.masukTotal.current)}
                  </p>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <p className="text-[11px] text-rose-800">Pengeluaran Keuangan</p>
                  <p className="text-sm font-extrabold text-rose-950 tabular-nums mt-0.5">
                    {formatRupiah(bundle.keuangan.keluarTotal.current)}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-600">Santri Aktif &amp; Ndalem</p>
                  <p className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                    {bundle.administrasi.totalSantriAktif} Santri
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-600">Kehadiran Jamaah</p>
                  <p className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                    {bundle.jamaah.persenHadir.current}%
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-600">Izin Pulang / Pelanggaran</p>
                  <p className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                    {bundle.perizinan.totalIzin.current} Izin · {bundle.keamanan.totalKasus.current} Kasus
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-600">Dapur &amp; Laundry</p>
                  <p className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                    {bundle.dapur.persenTepatWaktu.current}% Tepat · {bundle.laundry.totalPotong.current} Ptg
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-600">Kebersihan &amp; Piket</p>
                  <p className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                    {extraReports.kebersihan.persenBersih}% Bersih · {extraReports.kebersihan.totalTugas} Tugas
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] text-slate-600">Koperasi Pondok</p>
                  <p className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                    {formatRupiah(extraReports.koperasi.pemasukan)}
                  </p>
                </div>
                <div className="col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] text-slate-600">Pendaftaran Santri Baru (PSB)</p>
                    <p className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                      {extraReports.psb.pendaftarPeriode} Pendaftar Periode Ini · {extraReports.psb.terverifikasi} Verifikasi
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 tabular-nums shrink-0">
                    Total {extraReports.psb.totalSemua}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMobilePreviewOpen((prev) => !prev)}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-800 flex items-center justify-center gap-2"
              >
                {mobilePreviewOpen ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Sembunyikan Pratinjau Dokumen A4
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Tampilkan Pratinjau Dokumen A4 (Penuh)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Sumber tersembunyi Struktur Personalia baku (Bagian I Dewan Harian + Bagian II Pleno/Divisi A-K) */}
          <div ref={personaliaSourceRef} className="hidden" aria-hidden="true">
            <div
              data-siap-page-start="true"
              className="break-before-page print:break-before-page pt-2 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div>
                  <h4 className="text-[12pt] font-extrabold uppercase tracking-wider text-slate-900">
                    Struktur Personalia Pengurus Aktif
                  </h4>
                  <p className="text-[12pt] text-slate-600">
                    Susunan Dewan Harian &amp; Pleno Divisi (tidak termasuk Pengasuh, Dewan Pengasuh/Dzurriyah, dan Direktur Pendidikan)
                  </p>
                </div>
                <span className="text-[11pt] font-semibold text-slate-600">
                  Total {strukturPersonalia.totalOperationalAssignments} Penugasan
                </span>
              </div>

              {/* BAGIAN I: DEWAN HARIAN */}
              <div className="space-y-1.5">
                <h5 className="text-[11pt] font-extrabold uppercase tracking-wider text-emerald-800">
                  Bagian I · Dewan Harian
                </h5>
                <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                  <table className="w-full text-[11pt] border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 text-left">
                        <th className="px-2.5 py-1.5 border border-slate-200 w-12 text-center">No</th>
                        <th className="px-2.5 py-1.5 border border-slate-200 w-60">Jabatan</th>
                        <th className="px-2.5 py-1.5 border border-slate-200">Nama Pengurus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strukturPersonalia.dewanHarianSlots.map((slot) => (
                        <tr key={slot.nomor}>
                          <td className="px-2.5 py-1.5 border border-slate-200 text-center font-mono tabular-nums">
                            {slot.nomor}
                          </td>
                          <td className="px-2.5 py-1.5 border border-slate-200 font-semibold text-slate-800">
                            {slot.jabatan}
                          </td>
                          <td className="px-2.5 py-1.5 border border-slate-200 text-slate-900">
                            {slot.names.length > 0 ? slot.names.join(', ') : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* BAGIAN II: PLENO / DIVISI (A - K) */}
              <div className="space-y-2">
                <h5 className="text-[11pt] font-extrabold uppercase tracking-wider text-emerald-800">
                  Bagian II · Pleno / Divisi
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3">
                  {strukturPersonalia.plenoSections.map((sec) => {
                    const isMusyrif = sec.letter === 'K';
                    const mid = Math.ceil(sec.members.length / 2);
                    const halves = isMusyrif
                      ? [sec.members.slice(0, mid), sec.members.slice(mid)]
                      : [sec.members];

                    return (
                      <div
                        key={sec.letter}
                        className={`border border-slate-200 rounded-xl overflow-hidden break-inside-avoid ${
                          isMusyrif ? 'sm:col-span-2 print:col-span-2' : ''
                        }`}
                      >
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between gap-2">
                          <span className="text-[11pt] font-extrabold text-slate-900">
                            {sec.letter}. {sec.label}
                          </span>
                          <span className="text-[11pt] font-semibold text-slate-600 tabular-nums">
                            {sec.members.length} Org
                          </span>
                        </div>
                        {sec.members.length === 0 ? (
                          <p className="px-3 py-2 text-[11pt] italic text-slate-400">
                            Belum ada personel ditugaskan
                          </p>
                        ) : isMusyrif ? (
                          <div className="grid grid-cols-2 gap-3 p-2.5" data-siap-compact-table="true">
                            {halves.map((half, colIdx) => {
                              const offset = colIdx === 0 ? 0 : mid;
                              return (
                                <div
                                  key={`K-col-${colIdx}`}
                                  className="border border-slate-200 rounded-xl overflow-hidden bg-white divide-y divide-slate-100"
                                >
                                  {half.length === 0 ? (
                                    <div className="px-2.5 py-1.5 text-[11pt] italic text-slate-400">-</div>
                                  ) : (
                                    half.map((m, idx) => (
                                      <div
                                        key={`K-${offset + idx}`}
                                        className="px-2.5 py-1.5 flex items-start gap-2"
                                      >
                                        <span className="text-[11pt] text-slate-500 font-mono tabular-nums shrink-0 leading-snug">
                                          {offset + idx + 1}.
                                        </span>
                                        <div className="flex flex-col min-w-0 leading-snug">
                                          <span className="text-[11pt] font-bold text-slate-900 break-words">
                                            {m.nama}
                                          </span>
                                          <span className="text-[11pt] text-slate-600 break-words">
                                            {m.peran}
                                          </span>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <table className="w-full text-[11pt] border-collapse" data-siap-compact-table="true">
                            <tbody>
                              {sec.members.map((m, idx) => (
                                <tr key={`${sec.letter}-${idx}`} className="border-t first:border-t-0 border-slate-100">
                                  <td className="px-2 py-1 w-7 text-slate-500 font-mono tabular-nums align-top">
                                    {idx + 1}.
                                  </td>
                                  <td className="px-2 py-1 font-semibold text-slate-900 align-top">
                                    {m.nama}
                                  </td>
                                  <td className="px-2 py-1 text-right text-slate-600 whitespace-nowrap align-top">
                                    {m.peran}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Sumber tersembunyi Lampiran Dokumentasi Foto Kegiatan untuk disuntikkan ke Bab III. Kegiatan Pondok */}
          <div ref={kegiatanFotoSourceRef} className="hidden" aria-hidden="true">
            {kegiatanLampiranFoto.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[12pt] font-extrabold uppercase tracking-wider text-slate-900">
                    Lampiran Dokumentasi Foto Kegiatan
                  </h4>
                  <span className="text-[11pt] font-semibold text-slate-600 tabular-nums">
                    {kegiatanLampiranFoto.length} Agenda Terdokumentasi
                  </span>
                </div>

                <div className="space-y-3">
                  {kegiatanLampiranFoto.map((ag) => (
                    <div
                      key={ag.id}
                      className="border border-slate-200 rounded-xl overflow-hidden p-3 space-y-2 break-inside-avoid"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[12pt] font-bold text-slate-900">{ag.judul}</p>
                          <p className="text-[11pt] text-slate-600">
                            {ag.tanggal ? formatTanggalSuratIndo(ag.tanggal) : '-'}
                            {ag.jamMulai ? ` · ${ag.jamMulai} WIB` : ''}
                            {ag.lokasi ? ` · ${ag.lokasi}` : ''}
                          </p>
                        </div>
                        <span className="text-[11pt] font-bold px-2.5 py-0.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                          {ag.urls.length} Foto
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 print:grid-cols-3 gap-2.5">
                        {ag.urls.map((url, idx) => (
                          <div
                            key={`${ag.id}-foto-${idx}`}
                            className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 aspect-[4/3]"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Dokumentasi ${ag.judul} ${idx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>

                      {ag.notulensi && (
                        <p className="text-[12pt] text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                          <strong>Notulensi:</strong> {ag.notulensi}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sumber tersembunyi Rincian Tunggakan Syahriyah (Aktif saja & cutoff tgl 25) untuk Bab II */}
          <div ref={tunggakanTableSourceRef} className="hidden" aria-hidden="true">
            {syahriyahTunggakan.detail.length === 0 ? (
              <div className="rounded-xl overflow-hidden border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-[12pt] text-emerald-900 font-medium">
                Seluruh santri aktif sudah melunasi Syahriyah berjalan sesuai tanggal masuk.
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                <table className="w-full text-[11pt] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="px-2 py-1.5 border border-slate-200 w-10 text-center">No</th>
                      <th className="px-2 py-1.5 border border-slate-200">Nama Santri</th>
                      <th className="px-2 py-1.5 border border-slate-200">Kamar</th>
                      <th className="px-2 py-1.5 border border-slate-200 whitespace-nowrap">Tgl Masuk</th>
                      <th className="px-2 py-1.5 border border-slate-200">Bulan Menunggak</th>
                      <th className="px-2 py-1.5 border border-slate-200 text-right whitespace-nowrap">
                        Nominal Tunggakan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {syahriyahTunggakan.detail.map((row, idx) => (
                      <tr key={row.id}>
                        <td className="px-2 py-1.5 border border-slate-200 text-center font-mono tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 font-semibold text-slate-900">
                          {row.namaSantri}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 text-slate-700 whitespace-nowrap">
                          {row.kamar}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                          {row.tglMasuk}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 text-slate-700">
                          {row.bulanMenunggak} ({row.jumlahBulan} bln)
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 text-right font-mono font-bold tabular-nums text-rose-700 whitespace-nowrap">
                          {formatRupiah(row.totalTunggakan)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sumber tersembunyi Tabel Rincian Perizinan Pulang 8 Kolom untuk Bab IV */}
          <div ref={perizinanTableSourceRef} className="hidden" aria-hidden="true">
            {perizinanReportRows.length === 0 ? (
              <p className="text-[12pt] text-slate-600 italic py-2">
                Belum ada catatan perizinan pulang santri pada periode ini.
              </p>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                <table className="table-fixed w-full text-[10.5pt] border-collapse" data-siap-izin-table="true">
                  <colgroup>
                    <col className="w-[5%]" />
                    <col className="w-[17%]" />
                    <col className="w-[8%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[20%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="px-1.5 py-1.5 border border-slate-200 text-center">No</th>
                      <th className="px-1.5 py-1.5 border border-slate-200">Nama Santri</th>
                      <th className="px-1.5 py-1.5 border border-slate-200 text-center">Kamar</th>
                      <th className="px-1.5 py-1.5 border border-slate-200 text-center">Tgl Pulang</th>
                      <th className="px-1.5 py-1.5 border border-slate-200 text-center">Rencana Kembali</th>
                      <th className="px-1.5 py-1.5 border border-slate-200 text-center">Tgl Kembali</th>
                      <th className="px-1.5 py-1.5 border border-slate-200">Keperluan</th>
                      <th className="px-1.5 py-1.5 border border-slate-200">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perizinanReportRows.map((row, idx) => (
                      <tr key={row.id}>
                        <td className="px-1.5 py-1.5 border border-slate-200 text-center font-mono tabular-nums align-top">
                          {idx + 1}
                        </td>
                        <td className="px-1.5 py-1.5 border border-slate-200 font-semibold text-slate-900 break-words align-top">
                          {row.namaSantri}
                        </td>
                        <td className="px-1.5 py-1.5 border border-slate-200 text-center text-slate-700 break-words align-top">
                          {row.kamar}
                        </td>
                        <td className="px-1.5 py-1.5 border border-slate-200 text-center font-mono tabular-nums whitespace-nowrap align-top">
                          {row.tglPulang}
                        </td>
                        <td className="px-1.5 py-1.5 border border-slate-200 text-center font-mono tabular-nums whitespace-nowrap align-top">
                          {row.rencanaKembali}
                        </td>
                        <td className="px-1.5 py-1.5 border border-slate-200 text-center font-mono tabular-nums whitespace-nowrap align-top">
                          {row.tglKembali}
                        </td>
                        <td className="px-1.5 py-1.5 border border-slate-200 text-slate-700 break-words align-top">
                          {row.keperluan}
                        </td>
                        <td
                          className={`px-1.5 py-1.5 border border-slate-200 font-semibold break-words align-top ${
                            row.keterangan === 'Tepat Waktu'
                              ? 'text-emerald-800'
                              : row.keterangan === 'Sedang Izin'
                              ? 'text-amber-800'
                              : 'text-rose-700'
                          }`}
                        >
                          {row.keterangan}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sumber tersembunyi Lembar Pengesahan baku (TTD & Stempel Digital pas & tidak terpotong) */}
          <div ref={approvalSourceRef} className="hidden" aria-hidden="true">
            <section
              data-siap-page-start="true"
              data-siap-approval="true"
              className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 print:border-slate-300 break-inside-avoid print:break-before-page overflow-visible"
            >
              <div className="text-center border-b border-slate-200 pb-3 mb-6">
                <h3 className="text-[14pt] font-extrabold uppercase tracking-wider text-slate-900">
                  Lembar Pengesahan
                </h3>
                <p className="text-[12pt] text-slate-600 mt-0.5">
                  {pengaturanApproval.kota_surat}, {formatTanggalSuratIndo(todayStr)}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-4 px-2 text-center text-[12pt]">
                <div className="space-y-2 min-w-0">
                  <p className="font-semibold text-slate-700">Sekretaris Pondok</p>
                  <div className="h-20 w-full max-w-[170px] mx-auto flex items-center justify-center relative overflow-visible">
                    {useDigitalSignature && pengaturanApproval.ttd_sekretaris_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={pengaturanApproval.ttd_sekretaris_url}
                        alt="TTD Sekretaris"
                        referrerPolicy="no-referrer"
                        className="max-h-16 max-w-full object-contain"
                      />
                    )}
                  </div>
                  <p className="font-bold text-slate-900 underline underline-offset-4 break-words">
                    {pengaturanApproval.nama_sekretaris}
                  </p>
                </div>

                <div className="space-y-2 min-w-0">
                  <p className="font-semibold text-slate-700">Kepala Pondok</p>
                  <div className="h-20 w-full max-w-[180px] mx-auto flex items-center justify-center relative overflow-visible">
                    {useDigitalSignature && pengaturanApproval.stempel_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={pengaturanApproval.stempel_url}
                        alt="Stempel Pondok"
                        referrerPolicy="no-referrer"
                        className="max-h-16 max-w-[96px] object-contain opacity-85 absolute left-1/2 -translate-x-1/2 pointer-events-none"
                      />
                    )}
                    {useDigitalSignature && pengaturanApproval.ttd_kepala_pondok_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={pengaturanApproval.ttd_kepala_pondok_url}
                        alt="TTD Kepala Pondok"
                        referrerPolicy="no-referrer"
                        className="max-h-16 max-w-full object-contain relative z-10"
                      />
                    )}
                  </div>
                  <p className="font-bold text-slate-900 underline underline-offset-4 break-words">
                    {pengaturanApproval.nama_kepala_pondok}
                  </p>
                </div>

                <div className="space-y-2 min-w-0">
                  <p className="font-semibold text-slate-700">Mengetahui, Pengasuh Pondok</p>
                  <div className="h-20 w-full max-w-[170px] mx-auto flex items-center justify-center relative overflow-visible">
                    {useDigitalSignature && pengaturanApproval.ttd_pengasuh_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={pengaturanApproval.ttd_pengasuh_url}
                        alt="TTD Pengasuh"
                        referrerPolicy="no-referrer"
                        className="max-h-16 max-w-full object-contain"
                      />
                    )}
                  </div>
                  <p className="font-bold text-slate-900 underline underline-offset-4 break-words">
                    {pengaturanApproval.nama_pengasuh}
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Sumber tersembunyi Divisi XI-XIII untuk disuntikkan ke dalam kontainer kertas laporan tepat setelah Divisi X & sebelum Lembar Pengesahan */}
          <div ref={extraSourceRef} className="hidden" aria-hidden="true">
            {scope === 'gabungan' &&
              baseSelectedDivisions.length > 0 &&
              extraSelectedDivisions.length > 0 &&
              renderExtraDivisionSections()}
          </div>

          <div className={`${mobilePreviewOpen ? 'block' : 'hidden'} lg:block print:block space-y-6 print:space-y-5`}>
            {!isExtraKey(scope) && (scope !== 'gabungan' || baseSelectedDivisions.length > 0) && (
              <div ref={docWrapperRef}>
                <LaporanDocument
                  bundle={bundle}
                  scope={scope}
                  selectedDivisions={baseSelectedDivisions}
                  showCoverAndApproval={showCoverAndApproval}
                  showNotaLampiran={showNotaLampiran}
                  todayStr={todayStr}
                />
              </div>
            )}

            {(isExtraKey(scope) ||
              (scope === 'gabungan' &&
                baseSelectedDivisions.length === 0 &&
                extraSelectedDivisions.length > 0)) && (
              <div data-siap-laporan-doc="true" className="max-w-[210mm] mx-auto space-y-5 print:max-w-none">
                {isExtraKey(scope) && showCoverAndApproval && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden p-6 sm:p-8 print:border-0 print:rounded-none print:p-0 print:pb-4 border-b-2 border-b-slate-800">
                    <p className="text-[11pt] font-bold uppercase tracking-widest text-slate-500">
                      Pondok Pesantren An-Nur 1 Bululawang · Malang
                    </p>
                    <h2 className="text-[16pt] font-extrabold text-slate-900 mt-1">
                      Laporan Operasional Divisi{' '}
                      {ALL_DIVISIONS.find((d) => d.key === scope)?.label}
                    </h2>
                    <p className="text-[12pt] text-slate-600 mt-1">
                      Periode: <strong>{periodWindow?.label}</strong> ({periodWindow?.comparisonLabel})
                    </p>
                  </div>
                )}

                {renderExtraDivisionSections()}

                {showCoverAndApproval && (
                  <section
                    data-siap-page-start="true"
                    data-siap-approval="true"
                    className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 print:border-slate-300 break-inside-avoid print:break-before-page overflow-visible"
                  >
                    <div className="text-center border-b border-slate-200 pb-3 mb-6">
                      <h3 className="text-[14pt] font-extrabold uppercase tracking-wider text-slate-900">
                        Lembar Pengesahan
                      </h3>
                      <p className="text-[12pt] text-slate-600 mt-0.5">
                        {pengaturanApproval.kota_surat}, {formatTanggalSuratIndo(todayStr)}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-4 px-2 text-center text-[12pt]">
                      <div className="space-y-2 min-w-0">
                        <p className="font-semibold text-slate-700">Sekretaris Pondok</p>
                        <div className="h-20 w-full max-w-[170px] mx-auto flex items-center justify-center relative overflow-visible">
                          {useDigitalSignature && pengaturanApproval.ttd_sekretaris_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={pengaturanApproval.ttd_sekretaris_url}
                              alt="TTD Sekretaris"
                              referrerPolicy="no-referrer"
                              className="max-h-16 max-w-full object-contain"
                            />
                          )}
                        </div>
                        <p className="font-bold text-slate-900 underline underline-offset-4 break-words">
                          {pengaturanApproval.nama_sekretaris}
                        </p>
                      </div>

                      <div className="space-y-2 min-w-0">
                        <p className="font-semibold text-slate-700">Kepala Pondok</p>
                        <div className="h-20 w-full max-w-[180px] mx-auto flex items-center justify-center relative overflow-visible">
                          {useDigitalSignature && pengaturanApproval.stempel_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={pengaturanApproval.stempel_url}
                              alt="Stempel Pondok"
                              referrerPolicy="no-referrer"
                              className="max-h-16 max-w-[96px] object-contain opacity-85 absolute left-1/2 -translate-x-1/2 pointer-events-none"
                            />
                          )}
                          {useDigitalSignature && pengaturanApproval.ttd_kepala_pondok_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={pengaturanApproval.ttd_kepala_pondok_url}
                              alt="TTD Kepala Pondok"
                              referrerPolicy="no-referrer"
                              className="max-h-16 max-w-full object-contain relative z-10"
                            />
                          )}
                        </div>
                        <p className="font-bold text-slate-900 underline underline-offset-4 break-words">
                          {pengaturanApproval.nama_kepala_pondok}
                        </p>
                      </div>

                      <div className="space-y-2 min-w-0">
                        <p className="font-semibold text-slate-700">Mengetahui, Pengasuh Pondok</p>
                        <div className="h-20 w-full max-w-[170px] mx-auto flex items-center justify-center relative overflow-visible">
                          {useDigitalSignature && pengaturanApproval.ttd_pengasuh_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={pengaturanApproval.ttd_pengasuh_url}
                              alt="TTD Pengasuh"
                              referrerPolicy="no-referrer"
                              className="max-h-16 max-w-full object-contain"
                            />
                          )}
                        </div>
                        <p className="font-bold text-slate-900 underline underline-offset-4 break-words">
                          {pengaturanApproval.nama_pengasuh}
                        </p>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
