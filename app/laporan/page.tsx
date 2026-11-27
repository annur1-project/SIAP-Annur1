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
  dapurAbsenRows: Array<Record<string, unknown>>;
  dapurBukuMasakRows: Array<Record<string, unknown>>;
  dapurJualanMalamRows: Array<Record<string, unknown>>;
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

interface KegiatanTableRow {
  id: string;
  tanggalIso: string;
  tanggalText: string;
  waktuText: string;
  judul: string;
  kategori: string;
  lokasi: string;
  pj: string;
  pengisiList: Array<{ nama: string; peran: string }>;
  statusLabel: string;
  statusTone: 'emerald' | 'amber' | 'rose' | 'slate';
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
  { letter: 'G', label: 'Operator EMIS', aliases: ['operator emis'] },
  { letter: 'H', label: 'Sie Koperasi', aliases: ['sie koperasi', 'sie koprasi'] },
  { letter: 'I', label: 'Sie Laundry', aliases: ['sie laundry'] },
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
  if (/^(?:pimpinan\s*(?:&|dan)\s*harian|pengurus\s+harian|pimpinan)$/i.test(trimmed)) {
    return 'Dewan Harian';
  }
  if (trimmed === 'Pengasuh') return 'Pengasuh Pondok';
  if (/^sie\s+koprasi$/i.test(trimmed)) return 'Sie Koperasi';
  return trimmed;
}

function isExcludedTopLeadership(divisi: string, namaJabatan: string): boolean {
  const d = normalizeDivisiName(divisi).toLowerCase();
  const j = (namaJabatan || '').trim().toLowerCase();
  const matchesExcluded = (val: string) =>
    val.includes('pengasuh') ||
    val.includes('dzurriyah') ||
    val.includes('direktur');
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

function formatReadableKeperluan(text: string): string {
  const cleaned = (text || '')
    .replace(/\[IZIN_META:[\s\S]*?(?:\]|$)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const acronyms = new Set(['dp', 'psb', 'vip', 'wa', 'rs', 'ugd', 'puskesmas', 'ktp', 'kk']);
  return cleaned
    .replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/gi, (token) =>
      token
        .split('_')
        .filter(Boolean)
        .map((w) => {
          const lower = w.toLowerCase();
          return acronyms.has(lower) ? lower.toUpperCase() : lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ')
    )
    .trim();
}

function parseCleanKeperluan(raw: string): string {
  const txt = (raw || '').trim();
  if (!txt || txt === '-') return '-';
  const stripped = formatReadableKeperluan(txt);
  const metaMatch = txt.match(/\[IZIN_META:(\{[\s\S]*?\})\]/i);
  if (metaMatch && metaMatch[1]) {
    try {
      const parsed = JSON.parse(metaMatch[1]) as Record<string, unknown>;
      for (const k of ['keperluan', 'alasan', 'tujuan', 'keterangan', 'jenis_izin']) {
        const val = parsed[k];
        if (typeof val === 'string' && val.trim()) {
          const innerClean = formatReadableKeperluan(val);
          if (innerClean && innerClean !== '-') {
            if (stripped && !/^(?:tidak_menginap|menginap)$/i.test(stripped)) {
              return stripped;
            }
            return innerClean;
          }
        }
      }
    } catch {
      // ignore invalid meta JSON
    }
  }
  return stripped || '-';
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

function clearLaporanLocalCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const cacheHints = [
      'kegiatan',
      'agenda',
      'psb',
      'pendaftaran',
      'calon_santri',
      'kebersihan',
      'piket',
      'koperasi',
      'perizinan',
      'izin_pulang',
      'laporan',
    ];
    const toDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i) || '';
      const lower = k.toLowerCase();
      if (
        lower.startsWith('sb-') ||
        lower.includes('auth') ||
        lower.includes('token') ||
        lower.includes('session') ||
        lower.includes('theme') ||
        lower.includes('pengaturan')
      ) {
        continue;
      }
      if (cacheHints.some((hint) => lower.includes(hint))) {
        toDelete.push(k);
      }
    }
    toDelete.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore storage cleanup errors
  }
}

async function fetchAllAbsenJamaahPaginated(): Promise<Array<Record<string, unknown>> | null> {
  try {
    const allRows: Array<Record<string, unknown>> = [];
    const batchSize = 1000;
    let offset = 0;
    for (let page = 0; page < 50; page += 1) {
      const { data, error } = await supabase
        .from('absen_jamaah')
        .select('*')
        .order('tgl', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) return null;
      if (!Array.isArray(data) || data.length === 0) break;
      allRows.push(...(data as Array<Record<string, unknown>>));
      if (data.length < batchSize) break;
      offset += batchSize;
    }
    return allRows;
  } catch {
    return null;
  }
}

function mergeUniqueRows(
  groups: Array<Array<Record<string, unknown>>>
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

function compareIsoAsc(aIso: string, bIso: string, aCreated = '', bCreated = ''): number {
  const aValid = Boolean(aIso && /^\d{4}-\d{2}-\d{2}$/.test(aIso));
  const bValid = Boolean(bIso && /^\d{4}-\d{2}-\d{2}$/.test(bIso));
  if (aValid && bValid) {
    const diff = new Date(`${aIso}T00:00:00Z`).getTime() - new Date(`${bIso}T00:00:00Z`).getTime();
    if (diff !== 0) return diff;
  } else if (aValid !== bValid) {
    return aValid ? -1 : 1;
  } else if (aIso !== bIso) {
    return aIso.localeCompare(bIso);
  }
  if (aCreated && bCreated && aCreated !== bCreated) {
    return aCreated.localeCompare(bCreated);
  }
  return 0;
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

  const ddMmMatches = Array.from(txt.matchAll(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-]\d{2,4})?\b/g));
  const idMonthMatches = Array.from(
    txt.toLowerCase().matchAll(
      /\b(\d{1,2})\s+(jan|januari|feb|februari|mar|maret|apr|april|mei|jun|juni|jul|juli|agu|ags|agustus|sep|sept|september|okt|oktober|nov|november|des|desember)\b/g
    )
  );
  const isWeeklyToken =
    ddMmMatches.length > 0 ||
    idMonthMatches.length > 0 ||
    /\b(pekan|minggu|prd|periode)\b/i.test(txt);

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
    dapurAbsenRows: [],
    dapurBukuMasakRows: [],
    dapurJualanMalamRows: [],
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
  const kegiatanTableSourceRef = useRef<HTMLDivElement>(null);
  const kegiatanFotoSourceRef = useRef<HTMLDivElement>(null);
  const dapurExtraSourceRef = useRef<HTMLDivElement>(null);
  const extraSourceRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      setErrorMsg('');
      clearLaporanLocalCache();
      const [
        data,
        fullAbsenJamaahRows,
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
        kegiatanAgendaRes,
        kegiatanPengisiRows,
        kegiatanPetugasRows,
        pengisiKegiatanRows,
        kegiatanPengisiAcaraRows,
        agendaPengisiRows,
        kegiatanPanitiaRows,
        kegiatanRundownRows,
        kegiatanSusunanPengisiRows,
        kegiatanPetugasAcaraRows,
        perizinan1,
        perizinan2,
        perizinan3,
        pembayaranDetailRows,
        masterPembayaranRows,
        masterRiwayatRows,
        keuanganTransaksiRows,
        dapurAbsenRows,
        dapurBukuMasakRows,
        dapurJualanMalamRows,
      ] = await Promise.all([
        fetchAllLaporanRawData({ canViewBisyaroh }),
        fetchAllAbsenJamaahPaginated(),
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
        supabase.from('kegiatan_agenda').select('*'),
        fetchSafeTable('kegiatan_pengisi'),
        fetchSafeTable('kegiatan_petugas'),
        fetchSafeTable('pengisi_kegiatan'),
        fetchSafeTable('kegiatan_pengisi_acara'),
        fetchSafeTable('agenda_pengisi'),
        fetchSafeTable('kegiatan_panitia'),
        fetchSafeTable('kegiatan_rundown'),
        fetchSafeTable('kegiatan_susunan_pengisi'),
        fetchSafeTable('kegiatan_petugas_acara'),
        fetchSafeTable('perizinan'),
        fetchSafeTable('perizinan_pulang'),
        fetchSafeTable('izin_pulang'),
        fetchSafeTable('pembayaran_santri_detail'),
        fetchSafeTable('master_pembayaran'),
        fetchSafeTable('master_pembayaran_riwayat'),
        fetchSafeTable('keuangan_transaksi'),
        fetchSafeTable('dapur_absen_petugas'),
        fetchSafeTable('dapur_buku_masak'),
        fetchSafeTable('dapur_jualan_malam'),
      ]);

      const kegiatanAgendaRows =
        !kegiatanAgendaRes.error && Array.isArray(kegiatanAgendaRes.data)
          ? (kegiatanAgendaRes.data as Array<Record<string, unknown>>)
          : [];

      const patchedRaw = { ...(data as unknown as Record<string, unknown>) };
      if (fullAbsenJamaahRows !== null) {
        const jamaahKey = Object.keys(patchedRaw).find((k) => {
          const val = patchedRaw[k];
          if (!Array.isArray(val)) return false;
          if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
            const sample = val[0] as Record<string, unknown>;
            if ('waktu_sholat' in sample && 'santri_id' in sample && 'tgl' in sample) return true;
          }
          return /absen.*jamaah|jamaah.*rows|absenjamaah/i.test(k);
        });
        if (jamaahKey) {
          patchedRaw[jamaahKey] = fullAbsenJamaahRows;
        }
      }

      const isNonEmptyPengisiVal = (val: unknown): boolean => {
        if (val === null || val === undefined) return false;
        if (Array.isArray(val)) return val.length > 0;
        if (typeof val === 'string') {
          const t = val.trim();
          return Boolean(t && t !== '[]' && t !== '{}' && t !== '-' && t.toLowerCase() !== 'null');
        }
        if (typeof val === 'object') return Object.keys(val as Record<string, unknown>).length > 0;
        return false;
      };

      const kegiatanKey = Object.keys(patchedRaw).find((k) => {
        if (/pengisi|petugas|peserta|absen|dokumentasi|rundown|panitia/i.test(k)) return false;
        const val = patchedRaw[k];
        if (!Array.isArray(val)) return false;
        if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
          const sample = val[0] as Record<string, unknown>;
          if ('kode_kegiatan' in sample || 'pengisi_list' in sample || ('judul' in sample && 'jam_mulai' in sample)) {
            return true;
          }
        }
        return /^kegiatan(?:_?agenda|rows)?$/i.test(k);
      });

      const rawKegiatanFallback: Array<Record<string, unknown>> = [];
      const rawChildPengisiRows: Array<Record<string, unknown>> = [];
      for (const [k, val] of Object.entries(patchedRaw)) {
        if (!Array.isArray(val) || val.length === 0) continue;
        const sample = val[0];
        if (!sample || typeof sample !== 'object') continue;
        const rec = sample as Record<string, unknown>;
        const looksLikeChildPengisi =
          (/pengisi|petugas|panitia|rundown/i.test(k) && !('judul' in rec && 'jam_mulai' in rec)) ||
          (('kegiatan_id' in rec ||
            'agenda_id' in rec ||
            'kegiatan_agenda_id' in rec ||
            'id_kegiatan' in rec ||
            'id_agenda' in rec ||
            'agenda_kode' in rec) &&
            !('jam_mulai' in rec && 'judul' in rec));
        if (looksLikeChildPengisi) {
          rawChildPengisiRows.push(...(val as Array<Record<string, unknown>>));
          continue;
        }
        if ('kode_kegiatan' in rec || 'pengisi_list' in rec || ('judul' in rec && 'jam_mulai' in rec)) {
          rawKegiatanFallback.push(...(val as Array<Record<string, unknown>>));
        }
      }

      const pengisiExtraByKey = new Map<string, Array<Record<string, unknown>>>();
      const pengisiExtraSeen = new Map<string, Set<string>>();
      const addPengisiToMap = (rawKey: unknown, pRow: Record<string, unknown>) => {
        const key = String(rawKey || '').trim().toLowerCase();
        if (!key) return;
        const sig = String(pRow.id || '') || JSON.stringify(pRow);
        const seen = pengisiExtraSeen.get(key) || new Set<string>();
        if (seen.has(sig)) return;
        seen.add(sig);
        pengisiExtraSeen.set(key, seen);
        const arr = pengisiExtraByKey.get(key) || [];
        arr.push(pRow);
        pengisiExtraByKey.set(key, arr);
      };

      for (const pRow of [
        ...kegiatanPengisiRows,
        ...kegiatanPetugasRows,
        ...pengisiKegiatanRows,
        ...kegiatanPengisiAcaraRows,
        ...agendaPengisiRows,
        ...kegiatanPanitiaRows,
        ...kegiatanRundownRows,
        ...kegiatanSusunanPengisiRows,
        ...kegiatanPetugasAcaraRows,
        ...rawChildPengisiRows,
      ]) {
        const fkCandidates = [
          pRow.kegiatan_id,
          pRow.agenda_id,
          pRow.kegiatan_agenda_id,
          pRow.id_kegiatan,
          pRow.id_agenda,
          pRow.kegiatan_uuid,
          pRow.parent_id,
          pRow.ref_id,
          pRow.kode_kegiatan,
          pRow.agenda_kode,
        ];
        for (const fk of fkCandidates) {
          addPengisiToMap(fk, pRow);
        }
        const judulFk = pRow.judul_kegiatan || pRow.nama_kegiatan || pRow.agenda_judul;
        if (judulFk) addPengisiToMap(judulFk, pRow);
      }

      const mergeAgendaPair = (
        base: Record<string, unknown>,
        incoming: Record<string, unknown>
      ): Record<string, unknown> => {
        const merged: Record<string, unknown> = { ...base };
        for (const [k, v] of Object.entries(incoming)) {
          if (v === null || v === undefined) continue;
          if (!(k in merged) || merged[k] === null || merged[k] === undefined || !isNonEmptyPengisiVal(merged[k])) {
            merged[k] = v;
          }
        }
        return merged;
      };

      const agendaMergedMap = new Map<string, Record<string, unknown>>();
      const agendaNoIdList: Array<Record<string, unknown>> = [];
      for (const row of [...kegiatanAgendaRows, ...rawKegiatanFallback]) {
        const rid = String(row.id || row.kode_kegiatan || '').trim();
        if (!rid) {
          agendaNoIdList.push(row);
          continue;
        }
        const existing = agendaMergedMap.get(rid);
        agendaMergedMap.set(rid, existing ? mergeAgendaPair(existing, row) : row);
      }

      const mergedKegiatanRows = [...Array.from(agendaMergedMap.values()), ...agendaNoIdList].map((row) => {
        const lookupKeys = [
          row.id,
          row.kode_kegiatan,
          row.judul,
          row.nama_kegiatan,
        ]
          .map((v) => String(v || '').trim().toLowerCase())
          .filter(Boolean);
        let extraPengisi: Array<Record<string, unknown>> | undefined;
        for (const lk of lookupKeys) {
          const hit = pengisiExtraByKey.get(lk);
          if (hit && hit.length > 0) {
            extraPengisi = hit;
            break;
          }
        }
        const hasAnyPengisi = [
          row.pengisi_list,
          row.susunan_pengisi,
          row.daftar_pengisi,
          row.pengisi_acara,
          row.pengisi,
          row.petugas_list,
          row.susunan_petugas,
          row.daftar_petugas,
          row.petugas,
          row.kegiatan_pengisi,
          row.kegiatan_petugas,
        ].some(isNonEmptyPengisiVal);

        if (extraPengisi && extraPengisi.length > 0) {
          if (!hasAnyPengisi) {
            return { ...row, pengisi_list: extraPengisi, kegiatan_pengisi_extra: extraPengisi };
          }
          return { ...row, kegiatan_pengisi_extra: extraPengisi };
        }
        return row;
      });

      if (kegiatanKey && mergedKegiatanRows.length > 0) {
        patchedRaw[kegiatanKey] = mergedKegiatanRows;
      }

      setRawData(patchedRaw as unknown as AllLaporanRawData);
      setExtraRaw({
        kebersihanRows: mergeUniqueRows([kebLog, kebPiket, kebTugas, kebChecklist, kebNilai]),
        koperasiTransaksiRows: mergeUniqueRows([kopTrx, kopKas, kopJual, kopKulaan]),
        koperasiProdukRows: mergeUniqueRows([kopProduk, kopBarang]),
        psbRows: mergeUniqueRows([psb1, psb2, psb3]),
        kegiatanRows: mergedKegiatanRows,
        perizinanRows: mergeUniqueRows([perizinan1, perizinan2, perizinan3]),
        santriRows: santriKamarRows,
        pembayaranDetailRows,
        masterPembayaranRows,
        masterRiwayatRows,
        keuanganTransaksiRows,
        dapurAbsenRows,
        dapurBukuMasakRows,
        dapurJualanMalamRows,
      });

      const rawPengaturan =
        data && typeof data === 'object' && 'pengaturan' in data
          ? ((data as unknown as { pengaturan?: Record<string, unknown> }).pengaturan || null)
          : null;
      const settingRow =
        settingRows.find((r) => Number(r.id) === 1) || settingRows[0] || rawPengaturan;
      if (settingRow) {
        const pickUrl = (...vals: Array<unknown>): string | null => {
          for (const v of vals) {
            if (typeof v === 'string' && v.trim()) return v.trim();
          }
          return null;
        };
        setPengaturanApproval((prev) => ({
          nama_pesantren: String(settingRow.nama_pesantren || rawPengaturan?.nama_pesantren || prev.nama_pesantren),
          kota_surat: String(settingRow.kota_surat || rawPengaturan?.kota_surat || prev.kota_surat),
          tahun_ajaran_aktif: String(
            settingRow.tahun_ajaran_aktif || rawPengaturan?.tahun_ajaran_aktif || prev.tahun_ajaran_aktif
          ),
          nama_pengasuh: String(settingRow.nama_pengasuh || rawPengaturan?.nama_pengasuh || prev.nama_pengasuh),
          nama_kepala_pondok: String(
            settingRow.nama_kepala_pondok || rawPengaturan?.nama_kepala_pondok || prev.nama_kepala_pondok
          ),
          nama_sekretaris: String(settingRow.nama_sekretaris || rawPengaturan?.nama_sekretaris || prev.nama_sekretaris),
          ttd_pengasuh_url: pickUrl(
            settingRow.ttd_pengasuh_url,
            settingRow.ttd_pengasuh,
            rawPengaturan?.ttd_pengasuh_url,
            rawPengaturan?.ttd_pengasuh
          ),
          ttd_kepala_pondok_url: pickUrl(
            settingRow.ttd_kepala_pondok_url,
            settingRow.ttd_kepala_pondok,
            rawPengaturan?.ttd_kepala_pondok_url,
            rawPengaturan?.ttd_kepala_pondok
          ),
          ttd_sekretaris_url: pickUrl(
            settingRow.ttd_sekretaris_url,
            settingRow.ttd_sekretaris,
            rawPengaturan?.ttd_sekretaris_url,
            rawPengaturan?.ttd_sekretaris
          ),
          stempel_url: pickUrl(
            settingRow.stempel_url,
            settingRow.stempel_pondok_url,
            settingRow.url_stempel,
            rawPengaturan?.stempel_url,
            rawPengaturan?.stempel_pondok_url,
            rawPengaturan?.url_stempel
          ),
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
          const divisiNorm = normalizeDivisiName(String(j.divisi || ''));
          const namaJab = String(j.nama_jabatan || '');
          if (isExcludedTopLeadership(divisiNorm, namaJab)) continue;
          const list = jabMap.get(pid) || [];
          list.push({
            divisi: divisiNorm,
            nama_jabatan: namaJab,
            urutan_struktur: Number(j.urutan_struktur || 10),
          });
          jabMap.set(pid, list);
        }
        resolvedPengurus = amanRows.map((p) => {
          const pid = String(p.id || '');
          const embedded = Array.isArray(p.jabatan_list)
            ? (p.jabatan_list as Array<Record<string, unknown>>)
                .map((j) => ({
                  divisi: normalizeDivisiName(String(j.divisi || '')),
                  nama_jabatan: String(j.nama_jabatan || ''),
                  urutan_struktur: Number(j.urutan_struktur || 10),
                }))
                .filter((j) => !isExcludedTopLeadership(j.divisi, j.nama_jabatan))
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
            ? (p.jabatan_list as Array<Record<string, unknown>>)
                .map((j) => ({
                  divisi: normalizeDivisiName(String(j.divisi || '')),
                  nama_jabatan: String(j.nama_jabatan || ''),
                  urutan_struktur: Number(j.urutan_struktur || 10),
                }))
                .filter((j) => !isExcludedTopLeadership(j.divisi, j.nama_jabatan))
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
      .sort((a, b) =>
        compareIsoAsc(
          a.iso,
          b.iso,
          String(a.row.created_at || ''),
          String(b.row.created_at || '')
        )
      )
      .slice(0, 30)
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
      .sort((a, b) =>
        compareIsoAsc(
          a.iso,
          b.iso,
          String(a.row.created_at || ''),
          String(b.row.created_at || '')
        )
      )
      .slice(0, 30)
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
    const psbMaxTrend = Math.max(5, ...psbWeeklyTrend.map((w) => w.total));

    const psbDetail = psbCur
      .slice()
      .sort((a, b) =>
        compareIsoAsc(
          a.iso,
          b.iso,
          String(a.row.created_at || ''),
          String(b.row.created_at || '')
        )
      )
      .slice(0, 30)
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

    const mergedPerizinan = mergeUniqueRows([extraRaw.perizinanRows, rawPerizinanArr]);

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
      keterangan: 'Tepat Waktu' | 'Terlambat' | 'Sedang Izin';
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
        'tgl_aktual_kembali',
        'tanggal_aktual_kembali',
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
      const hasReturnedStatus = /\b(kembali|terlambat|selesai|sudah|tepat)\b/.test(statusLower);
      const hasNotReturnedStatus =
        (/sedang|belum|keluar|aktif|berlangsung|menunggu|disetujui/.test(statusLower) &&
          !hasReturnedStatus) ||
        false;

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

      let metaBatasJam = '';
      let metaJamKembali = '';
      for (const fieldName of ['alasan', 'keperluan']) {
        const rawVal = String(row[fieldName] || '');
        const m = rawVal.match(/\[IZIN_META:(\{[\s\S]*?\})\]/i);
        if (m && m[1]) {
          try {
            const parsed = JSON.parse(m[1]) as Record<string, unknown>;
            if (typeof parsed.b === 'string') metaBatasJam = parsed.b.trim();
            if (typeof parsed.jk === 'string') metaJamKembali = parsed.jk.trim();
          } catch {
            // ignore
          }
          break;
        }
      }

      let keterangan: PerizinanDetailRow['keterangan'];
      if (statusLower === 'terlambat') {
        keterangan = 'Terlambat';
      } else if (resolvedTglKembaliIso) {
        if (resolvedRencanaIso && resolvedTglKembaliIso > resolvedRencanaIso) {
          keterangan = 'Terlambat';
        } else if (
          (!resolvedRencanaIso || resolvedTglKembaliIso === resolvedRencanaIso) &&
          metaBatasJam &&
          metaJamKembali &&
          metaJamKembali > metaBatasJam
        ) {
          keterangan = 'Terlambat';
        } else {
          keterangan = 'Tepat Waktu';
        }
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

    rows.sort((a, b) => {
      const dCmp = compareIsoAsc(a.tglPulangIso, b.tglPulangIso);
      if (dCmp !== 0) return dCmp;
      return a.namaSantri.localeCompare(b.namaSantri, 'id');
    });
    return rows;
  }, [activeRange, extraRaw, rawData, todayStr]);

  const kegiatanTableRows = useMemo<KegiatanTableRow[]>(() => {
    const { start, end } = activeRange;

    const personNameMap = new Map<string, string>();
    for (const p of pengurusRows) {
      if (p.id && p.nama_lengkap) personNameMap.set(p.id, p.nama_lengkap);
    }
    for (const s of extraRaw.santriRows) {
      const sid = String(s.id || '');
      const nm = extractTextField(s, ['nama_lengkap', 'nama_santri', 'nama'], '');
      if (sid && nm) personNameMap.set(sid, nm);
    }

    const extractNestedPersonName = (obj: unknown): string => {
      if (!obj || typeof obj !== 'object') return '';
      return extractTextField(
        obj as Record<string, unknown>,
        ['nama_lengkap', 'nama_santri', 'nama_pengurus', 'nama', 'name'],
        ''
      );
    };

    const parsePengisi = (raw: unknown): Array<{ nama: string; peran: string }> => {
      let current: unknown = raw;
      if (typeof current === 'string') {
        let trimmed = current.trim();
        for (let depth = 0; depth < 2 && typeof current === 'string'; depth += 1) {
          trimmed = current.trim();
          if (!trimmed) break;
          if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
              current = JSON.parse(trimmed);
            } catch {
              break;
            }
          } else {
            break;
          }
        }
      }

      const rawOut: Array<{ nama: string; peran: string }> = [];
      let arr: unknown[] = [];

      if (Array.isArray(current)) {
        arr = current;
      } else if (current && typeof current === 'object') {
        const obj = current as Record<string, unknown>;
        const arrCandidate =
          obj.list ??
          obj.items ??
          obj.pengisi ??
          obj.data ??
          obj.rows ??
          obj.members ??
          obj.petugas ??
          obj.susunan ??
          obj.daftar;
        if (Array.isArray(arrCandidate)) {
          arr = arrCandidate;
        } else if (
          'nama' in obj ||
          'nama_lengkap' in obj ||
          'nama_pengisi' in obj ||
          'pengisi_nama' in obj ||
          'petugas' in obj ||
          'santri_id' in obj ||
          'pengurus_id' in obj
        ) {
          arr = [obj];
        } else {
          const skipMetaKeys = new Set([
            'id',
            'kegiatan_id',
            'agenda_id',
            'kegiatan_agenda_id',
            'created_at',
            'updated_at',
            'urutan',
            'sort_order',
          ]);
          for (const [k, v] of Object.entries(obj)) {
            if (skipMetaKeys.has(k.toLowerCase())) continue;
            if (typeof v === 'string' && v.trim()) {
              rawOut.push({ nama: v.trim(), peran: k.replace(/_/g, ' ') });
            } else if (Array.isArray(v)) {
              v.forEach((sub) => {
                if (typeof sub === 'string' && sub.trim()) {
                  rawOut.push({ nama: sub.trim(), peran: k.replace(/_/g, ' ') });
                } else if (sub && typeof sub === 'object') {
                  arr.push({ ...(sub as Record<string, unknown>), __fallbackPeran: k.replace(/_/g, ' ') });
                }
              });
            }
          }
          if (arr.length === 0) return rawOut;
        }
      } else if (typeof current === 'string' && current.trim()) {
        const cleanedStr = current.trim();
        if (cleanedStr === '-' || cleanedStr === '[]' || cleanedStr === '{}') {
          return [];
        }
        const lineSplit = cleanedStr.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
        const degreeRx = /^(?:S\.|M\.|Dr\.|Drs\.|Ir\.|Lc\b|H\.|Hj\.|K\.H\.|KH\.|Ph\.D|SE\b|SH\b|MM\b|MA\b|M\.Si|S\.Pd|M\.Pd|S\.Ag|M\.Ag)/i;
        if (lineSplit.length === 1 && /,/.test(lineSplit[0])) {
          const commaParts = lineSplit[0].split(',').map((s) => s.trim()).filter(Boolean);
          const looksLikeTitleComma = commaParts.some((p, idx) => idx > 0 && degreeRx.test(p));
          if (!looksLikeTitleComma && (/[:()]/.test(lineSplit[0]) || commaParts.length >= 2)) {
            arr = commaParts;
          } else {
            arr = lineSplit;
          }
        } else {
          arr = lineSplit;
        }
      }

      const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isoRx = /^\d{4}-\d{2}-\d{2}/;

      for (const item of arr) {
        if (typeof item === 'string') {
          const s = item.replace(/^\d+[.)]\s*/, '').trim();
          if (!s || s === '-') continue;
          const colonMatch = s.match(/^([^:]{2,36}):\s*(.+)$/);
          if (colonMatch) {
            rawOut.push({ nama: colonMatch[2].trim(), peran: colonMatch[1].trim() });
            continue;
          }
          const m = s.match(/^(.+?)\s*(?:\(([^)]+)\)|[-—–]\s*(.+))$/);
          if (m) {
            rawOut.push({ nama: m[1].trim(), peran: (m[2] || m[3] || '').trim() });
          } else {
            rawOut.push({ nama: s, peran: '' });
          }
        } else if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          const idRef = String(
            rec.pengurus_id ||
              rec.santri_id ||
              rec.person_id ||
              rec.user_id ||
              rec.anggota_id ||
              rec.petugas_id ||
              rec.pengisi_id ||
              rec.id_santri ||
              rec.id_pengurus ||
              ''
          );
          let nama =
            extractTextField(
              rec,
              [
                'nama',
                'nama_lengkap',
                'nama_santri',
                'nama_pengurus',
                'nama_petugas',
                'nama_pengisi',
                'pengisi_nama',
                'petugas_nama',
                'santri_nama',
                'pengurus_nama',
                'name',
                'petugas',
                'pengisi',
                'pelaksana',
                'pemateri',
                'narasumber',
                'ustadz',
                'orang',
                'person',
                'pic',
                'anggota',
                'peserta',
                'value',
                'isi',
              ],
              ''
            ) ||
            extractNestedPersonName(rec.santri) ||
            extractNestedPersonName(rec.pengurus) ||
            extractNestedPersonName(rec.user) ||
            extractNestedPersonName(rec.anggota) ||
            extractNestedPersonName(rec.petugas_obj) ||
            extractNestedPersonName(rec.pengisi_obj) ||
            (idRef ? personNameMap.get(idRef) || '' : '');

          let peran = extractTextField(
            rec,
            [
              'peran',
              'tugas',
              'jabatan',
              'role',
              'sebagai',
              'bagian',
              'posisi',
              'peran_pengisi',
              'keterangan',
              '__fallbackPeran',
            ],
            ''
          );

          if (!peran && ('value' in rec || 'isi' in rec)) {
            peran = extractTextField(rec, ['label', 'key', 'nama_peran'], '');
          }

          if (!nama && typeof rec.label === 'string' && rec.label.trim()) {
            nama = rec.label.trim();
          }

          if (!nama) {
            for (const [k, v] of Object.entries(rec)) {
              if (typeof v !== 'string') continue;
              const tv = v.trim();
              if (!tv || tv === '-' || uuidRx.test(tv) || isoRx.test(tv)) continue;
              if (/nama|pengisi|petugas|santri|pengurus|person|pic|orang|user|anggota|pemateri/i.test(k)) {
                nama = tv;
                break;
              }
            }
          }

          if (!peran) {
            for (const [k, v] of Object.entries(rec)) {
              if (typeof v !== 'string') continue;
              const tv = v.trim();
              if (!tv || tv === '-' || tv === nama || uuidRx.test(tv) || isoRx.test(tv)) continue;
              if (/peran|tugas|jabatan|role|bagian|posisi|sebagai|label|jenis|bidang/i.test(k)) {
                peran = tv;
                break;
              }
            }
          }

          if (nama && nama !== '-') {
            rawOut.push({ nama, peran: peran === '-' ? '' : peran });
          }
        }
      }

      const deduped: Array<{ nama: string; peran: string }> = [];
      const seen = new Set<string>();
      for (const entry of rawOut) {
        const cleanNama = entry.nama.trim();
        const cleanPeran = entry.peran.trim();
        if (!cleanNama || cleanNama === '-') continue;
        const key = `${cleanNama.toLowerCase()}||${cleanPeran.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({ nama: cleanNama, peran: cleanPeran });
      }
      return deduped;
    };

    const normalizeKey = (v: unknown) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const fallbackPengisiMap = new Map<string, Array<{ nama: string; peran: string }>>();
    const addFallbackPengisi = (keyRaw: unknown, items: Array<{ nama: string; peran: string }>) => {
      const k = normalizeKey(keyRaw);
      if (!k || items.length === 0) return;
      const existing = fallbackPengisiMap.get(k) || [];
      const merged = [...existing];
      const seen = new Set(existing.map((x) => `${x.nama.toLowerCase()}||${x.peran.toLowerCase()}`));
      for (const it of items) {
        const sig = `${it.nama.toLowerCase()}||${it.peran.toLowerCase()}`;
        if (!seen.has(sig)) {
          seen.add(sig);
          merged.push(it);
        }
      }
      fallbackPengisiMap.set(k, merged);
    };

    const inspectBundleValue = (val: unknown, depth = 0) => {
      if (!val || depth > 4) return;
      if (Array.isArray(val)) {
        for (const entry of val) {
          if (!entry || typeof entry !== 'object') continue;
          const rec = entry as Record<string, unknown>;
          const judul = extractTextField(rec, ['judul', 'nama_kegiatan', 'judul_kegiatan', 'agenda_judul', 'nama', 'kegiatan'], '');
          const idKey = rec.id ?? rec.kegiatan_id ?? rec.agenda_id ?? rec.kegiatan_agenda_id ?? rec.kode_kegiatan;
          const candidates = [
            rec.pengisiList,
            rec.pengisi_list,
            rec.susunanPengisi,
            rec.susunan_pengisi,
            rec.daftarPengisi,
            rec.daftar_pengisi,
            rec.pengisiAcara,
            rec.pengisi_acara,
            rec.pengisi,
            rec.petugasList,
            rec.petugas_list,
            rec.susunanPetugas,
            rec.susunan_petugas,
            rec.daftarPetugas,
            rec.daftar_petugas,
            rec.petugas,
            rec.susunan,
            rec.rundown,
            rec.detailPengisi,
            rec.detail_pengisi,
            rec.pengisiText,
            rec.petugasText,
          ];
          let parsed: Array<{ nama: string; peran: string }> = [];
          for (const c of candidates) {
            if (c !== null && c !== undefined) {
              const p = parsePengisi(c);
              if (p.length > 0) {
                parsed = p;
                break;
              }
            }
          }
          if (parsed.length === 0 && (rec.kegiatan_id || rec.agenda_id || rec.kegiatan_agenda_id || rec.judul_kegiatan || rec.agenda_judul)) {
            parsed = parsePengisi([rec]);
          }
          if (parsed.length > 0) {
            if (idKey) addFallbackPengisi(idKey, parsed);
            if (rec.kode_kegiatan) addFallbackPengisi(rec.kode_kegiatan, parsed);
            if (judul) addFallbackPengisi(judul, parsed);
          }
        }
      } else if (typeof val === 'object') {
        for (const sub of Object.values(val as Record<string, unknown>)) {
          inspectBundleValue(sub, depth + 1);
        }
      }
    };

    const bundleGiatObj =
      bundle && typeof bundle === 'object'
        ? ((bundle as unknown as Record<string, unknown>).kegiatan as Record<string, unknown> | undefined)
        : undefined;
    if (bundleGiatObj) {
      inspectBundleValue(bundleGiatObj);
    }

    if (rawData && typeof rawData === 'object') {
      for (const [k, val] of Object.entries(rawData as unknown as Record<string, unknown>)) {
        if (!Array.isArray(val) || val.length === 0) continue;
        const first = val[0];
        if (!first || typeof first !== 'object') continue;
        const sample = first as Record<string, unknown>;
        const isChildPengisiArr =
          /pengisi|petugas|panitia|rundown/i.test(k) ||
          'kegiatan_id' in sample ||
          'agenda_id' in sample ||
          'kegiatan_agenda_id' in sample ||
          'id_kegiatan' in sample ||
          'id_agenda' in sample;
        if (!isChildPengisiArr) continue;
        for (const item of val) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const parsed = parsePengisi([rec]);
          if (parsed.length === 0) continue;
          for (const fk of [
            rec.kegiatan_id,
            rec.agenda_id,
            rec.kegiatan_agenda_id,
            rec.id_kegiatan,
            rec.id_agenda,
            rec.kode_kegiatan,
            rec.agenda_kode,
            rec.judul_kegiatan,
            rec.nama_kegiatan,
            rec.agenda_judul,
          ]) {
            if (fk) addFallbackPengisi(fk, parsed);
          }
        }
      }
    }

    const formatStatus = (
      rawStatus: string
    ): { label: string; tone: KegiatanTableRow['statusTone'] } => {
      const st = (rawStatus || '').trim().toLowerCase();
      if (/selesai|terlaksana|done|completed|sudah/.test(st)) {
        return { label: 'Terlaksana', tone: 'emerald' };
      }
      if (/batal|cancel/.test(st)) {
        return { label: 'Dibatalkan', tone: 'rose' };
      }
      if (/berlangsung|aktif|jalan/.test(st)) {
        return { label: 'Berlangsung', tone: 'amber' };
      }
      if (/terjadwal|rencana|scheduled|akan/.test(st) || !st) {
        return { label: 'Terjadwal', tone: 'slate' };
      }
      return { label: rawStatus.trim(), tone: 'slate' };
    };

    const out: KegiatanTableRow[] = [];
    extraRaw.kegiatanRows.forEach((row, idx) => {
      const judul = extractTextField(row, ['judul', 'nama_kegiatan', 'nama', 'kegiatan'], '');
      if (!judul) return;
      const iso = extractRowDateIso(row);
      if (iso && (iso < start || iso > end)) return;

      const jamMulai = extractTextField(row, ['jam_mulai', 'waktu_mulai', 'jam'], '');
      const jamSelesai = extractTextField(row, ['jam_selesai', 'waktu_selesai'], '');
      const waktuText = jamMulai
        ? jamSelesai
          ? `${jamMulai}–${jamSelesai} WIB`
          : `${jamMulai} WIB`
        : '-';
      const kategori = extractTextField(row, ['kategori', 'jenis', 'bidang'], 'Agenda Pondok');
      const lokasi = extractTextField(row, ['lokasi', 'tempat', 'ruangan'], '-');
      const pj = extractTextField(row, ['penanggung_jawab', 'pj', 'koordinator', 'ketua'], '-');

      const pengisiFieldCandidates: unknown[] = [
        row.pengisi_list,
        row.susunan_pengisi,
        row.daftar_pengisi,
        row.pengisi_acara,
        row.pengisi,
        row.petugas_list,
        row.susunan_petugas,
        row.daftar_petugas,
        row.petugas,
        row.petugas_acara,
        row.tim_pelaksana,
        row.panitia,
        row.panitia_list,
        row.rundown,
        row.susunan_acara,
        row.detail_pengisi,
        row.pengisi_kegiatan,
        row.petugas_kegiatan,
        row.pemateri,
        row.narasumber,
        row.pengisi_json,
        row.kegiatan_pengisi,
        row.kegiatan_petugas,
      ];
      for (const [dynKey, dynVal] of Object.entries(row)) {
        if (
          /pengisi|petugas|panitia|pemateri|narasumber|rundown/i.test(dynKey) &&
          !/id$|foto|url|jumlah|total|count/i.test(dynKey)
        ) {
          pengisiFieldCandidates.push(dynVal);
        }
      }

      let pengisiList: Array<{ nama: string; peran: string }> = [];
      for (const cand of pengisiFieldCandidates) {
        if (cand === null || cand === undefined) continue;
        const parsed = parsePengisi(cand);
        if (parsed.length > 0) {
          pengisiList = parsed;
          break;
        }
      }

      if (pengisiList.length === 0) {
        const discreteRoles: Array<[string, string]> = [
          ['mc', 'MC'],
          ['pembawa_acara', 'MC'],
          ['qori', 'Qori'],
          ['imam', 'Imam'],
          ['kultum', 'Kultum'],
          ['penceramah', 'Penceramah'],
          ['pemateri', 'Pemateri'],
          ['moderator', 'Moderator'],
          ['doa', 'Doa'],
          ['sambutan', 'Sambutan'],
          ['dirigen', 'Dirigen'],
        ];
        for (const [field, label] of discreteRoles) {
          const val = extractTextField(row, [field], '');
          if (val && val !== '-') {
            pengisiList.push({ nama: val, peran: label });
          }
        }
      }

      if (pengisiList.length === 0) {
        const notesBlob = [row.notulensi, row.deskripsi, row.keterangan, row.catatan]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .join('\n');
        if (notesBlob) {
          const roleLineMatches = notesBlob.matchAll(
            /^(?:[-*•]\s*)?(Pengisi|Petugas|MC|Pembawa Acara|Qori|Imam|Pemateri|Penceramah|Moderator|Kultum|Doa|Sambutan|Dirigen)\s*:\s*(.+)$/gim
          );
          for (const m of roleLineMatches) {
            const roleLabel = m[1].trim();
            const valText = m[2].trim();
            if (valText && valText !== '-') {
              if (/^(?:pengisi|petugas)$/i.test(roleLabel)) {
                pengisiList.push(...parsePengisi(valText));
              } else {
                pengisiList.push({ nama: valText, peran: roleLabel });
              }
            }
          }
        }
      }

      if (pengisiList.length === 0) {
        for (const fk of [row.id, row.kode_kegiatan, judul]) {
          const hit = fallbackPengisiMap.get(normalizeKey(fk));
          if (hit && hit.length > 0) {
            pengisiList = hit;
            break;
          }
        }
      }

      const st = formatStatus(String(row.status || ''));

      out.push({
        id: String(row.id || `giat-${idx}`),
        tanggalIso: iso,
        tanggalText: iso ? formatIsoDisplay(iso) : '-',
        waktuText,
        judul,
        kategori,
        lokasi,
        pj,
        pengisiList,
        statusLabel: st.label,
        statusTone: st.tone,
      });
    });

    out.sort((a, b) => {
      const dCmp = compareIsoAsc(a.tanggalIso, b.tanggalIso);
      if (dCmp !== 0) return dCmp;
      return a.waktuText.localeCompare(b.waktuText);
    });
    return out;
  }, [activeRange, extraRaw.kegiatanRows, extraRaw.santriRows, pengurusRows, bundle, rawData]);

  const dapurExtraReports = useMemo(() => {
    const { start, end } = activeRange;
    const activeTa =
      pengaturanApproval.tahun_ajaran_aktif ||
      (todayStr ? getTahunAjaranForDate(todayStr) : '');
    const aktifAll = pengurusRows.filter(
      (p) => !p.status || p.status.trim().toLowerCase() === 'aktif'
    );
    const matchedTa = activeTa ? aktifAll.filter((p) => p.masa_khidmat === activeTa) : [];
    const sourcePeople = matchedTa.length > 0 ? matchedTa : aktifAll;

    // 1. Rekap Absensi Petugas Dapur
    const dapurStaff: Array<{ id: string; nama: string; jabatan: string }> = [];
    for (const p of sourcePeople) {
      const jabs = Array.isArray(p.jabatan_list) ? p.jabatan_list : [];
      const dJab = jabs.find((j) => {
        if (isExcludedTopLeadership(j.divisi, j.nama_jabatan)) return false;
        return (
          normalizeDivisiName(j.divisi).toLowerCase().includes('dapur') ||
          (j.nama_jabatan || '').toLowerCase().includes('dapur')
        );
      });
      if (dJab) {
        dapurStaff.push({
          id: p.id,
          nama: p.nama_lengkap,
          jabatan: formatCleanSectionRole(dJab.divisi, dJab.nama_jabatan, dJab.urutan_struktur),
        });
      }
    }
    dapurStaff.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

    const absenMap = new Map<
      string,
      { nama: string; total: number; hadir: number; izinTelat: number; alpha: number }
    >();
    for (const st of dapurStaff) {
      absenMap.set(st.id, { nama: st.nama, total: 0, hadir: 0, izinTelat: 0, alpha: 0 });
    }

    for (const row of extraRaw.dapurAbsenRows) {
      const iso = extractRowDateIso(row);
      if (!iso || iso < start || iso > end) continue;
      const rawPid = String(row.petugas_id || '').trim();
      const rawNama = String(row.petugas_nama || '').trim();
      const matched = dapurStaff.find(
        (st) =>
          st.id === rawPid ||
          `pg-${st.id}` === rawPid ||
          (rawNama && st.nama.trim().toLowerCase() === rawNama.toLowerCase())
      );
      const key = matched?.id || rawPid || rawNama.toLowerCase() || `unknown-${absenMap.size}`;
      const existing = absenMap.get(key) || {
        nama: matched?.nama || rawNama || 'Petugas Dapur',
        total: 0,
        hadir: 0,
        izinTelat: 0,
        alpha: 0,
      };
      const stLower = String(row.status || '').trim().toLowerCase();
      if (stLower === 'hadir') {
        existing.hadir += 1;
        existing.total += 1;
      } else if (/izin|sakit|terlambat|telat/.test(stLower)) {
        existing.izinTelat += 1;
        existing.total += 1;
      } else if (/alpha|alpa|tidak/.test(stLower)) {
        existing.alpha += 1;
        existing.total += 1;
      }
      absenMap.set(key, existing);
    }

    const absenRekap = Array.from(absenMap.values())
      .map((r) => ({
        ...r,
        persen: r.total > 0 ? Math.round((r.hadir / r.total) * 100) : 0,
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

    const absenTotals = absenRekap.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        hadir: acc.hadir + r.hadir,
        izinTelat: acc.izinTelat + r.izinTelat,
        alpha: acc.alpha + r.alpha,
      }),
      { total: 0, hadir: 0, izinTelat: 0, alpha: 0 }
    );
    const absenPersenTotal =
      absenTotals.total > 0 ? Math.round((absenTotals.hadir / absenTotals.total) * 100) : 0;

    // 2. Buku Kas Harian Belanja Masak Dapur (Buku 1 • Anggaran Pondok)
    const getBuku1TipeRank = (row: Record<string, unknown>): number => {
      const tipe = String(row.tipe || '').toLowerCase();
      if (tipe === 'jatah_harian') return 1;
      if (tipe === 'subsidi_jualan_malam') return 2;
      if (tipe === 'belanja_pagi' || tipe.includes('pagi')) return 3;
      if (tipe === 'belanja_sore' || tipe.includes('sore')) return 4;
      return 5;
    };

    const b1Asc = [...extraRaw.dapurBukuMasakRows]
      .map((r) => ({
        row: r,
        iso: extractRowDateIso(r),
        tipeRank: getBuku1TipeRank(r),
        createdAt: String(r.created_at || ''),
      }))
      .filter((x) => !end || !x.iso || x.iso <= end)
      .sort((a, b) => {
        const dCmp = compareIsoAsc(a.iso, b.iso);
        if (dCmp !== 0) return dCmp;
        if (a.tipeRank !== b.tipeRank) return a.tipeRank - b.tipeRank;
        return a.createdAt.localeCompare(b.createdAt);
      });

    let b1Saldo = 0;
    let b1JatahMasuk = 0;
    let b1BelanjaPagiSore = 0;
    let b1SubsidiMasuk = 0;
    const b1Mutations: Array<{
      id: string;
      tanggal: string;
      kategoriLabel: string;
      uraian: string;
      pj: string;
      arah: 'masuk' | 'keluar';
      nominal: number;
      saldo: number;
    }> = [];

    b1Asc.forEach(({ row, iso }, idx) => {
      const tipe = String(row.tipe || '').toLowerCase();
      const arahRaw = String(row.arah || '').toLowerCase();
      const arah: 'masuk' | 'keluar' =
        arahRaw === 'masuk' || tipe === 'jatah_harian' || tipe === 'subsidi_jualan_malam'
          ? 'masuk'
          : 'keluar';
      const nominal = extractNumericField(row, ['nominal', 'jumlah', 'total']);
      b1Saldo += arah === 'masuk' ? nominal : -nominal;

      if (iso && iso >= start && iso <= end) {
        if (tipe === 'subsidi_jualan_malam') {
          b1SubsidiMasuk += nominal;
        } else if (arah === 'masuk') {
          b1JatahMasuk += nominal;
        } else {
          b1BelanjaPagiSore += nominal;
        }
        const kategoriLabel =
          tipe === 'jatah_harian'
            ? 'Jatah Harian'
            : tipe === 'subsidi_jualan_malam'
            ? 'Subsidi Jualan Malam'
            : tipe === 'belanja_pagi'
            ? 'Belanja Pagi'
            : tipe === 'belanja_sore'
            ? 'Belanja Sore'
            : arah === 'masuk'
            ? 'Masuk'
            : 'Belanja';
        b1Mutations.push({
          id: String(row.id || `b1-${idx}`),
          tanggal: iso ? formatIsoDisplay(iso) : '-',
          kategoriLabel,
          uraian: extractTextField(row, ['uraian', 'keterangan'], '-'),
          pj: extractTextField(row, ['penanggung_jawab', 'pj'], '-'),
          arah,
          nominal,
          saldo: b1Saldo,
        });
      }
    });

    // 3. Buku Kas Usaha Jualan Malam Dapur (Buku 2)
    const b2Asc = [...extraRaw.dapurJualanMalamRows]
      .map((r) => ({
        row: r,
        iso: extractRowDateIso(r),
        createdAt: String(r.created_at || ''),
      }))
      .filter((x) => !end || !x.iso || x.iso <= end)
      .sort((a, b) => compareIsoAsc(a.iso, b.iso, a.createdAt, b.createdAt));

    let b2Saldo = 0;
    let b2Omzet = 0;
    let b2Modal = 0;
    let b2SubsidiKeluar = 0;
    const b2Transactions: Array<{
      id: string;
      tanggal: string;
      kategoriLabel: string;
      uraian: string;
      pj: string;
      arah: 'masuk' | 'keluar';
      nominal: number;
      saldo: number;
    }> = [];

    b2Asc.forEach(({ row, iso }, idx) => {
      const tipe = String(row.tipe || '').toLowerCase();
      const arahRaw = String(row.arah || '').toLowerCase();
      const arah: 'masuk' | 'keluar' =
        arahRaw === 'masuk' || tipe === 'omzet_jualan' ? 'masuk' : 'keluar';
      const nominal = extractNumericField(row, ['nominal', 'jumlah', 'total']);
      b2Saldo += arah === 'masuk' ? nominal : -nominal;

      if (iso && iso >= start && iso <= end) {
        if (arah === 'masuk') {
          b2Omzet += nominal;
        } else if (tipe === 'subsidi_ke_masak') {
          b2SubsidiKeluar += nominal;
        } else {
          b2Modal += nominal;
        }
        const kategoriLabel =
          tipe === 'omzet_jualan'
            ? 'Omzet Malam'
            : tipe === 'subsidi_ke_masak'
            ? 'Subsidi ke Buku 1'
            : 'Modal / Belanja';
        b2Transactions.push({
          id: String(row.id || `b2-${idx}`),
          tanggal: iso ? formatIsoDisplay(iso) : '-',
          kategoriLabel,
          uraian: extractTextField(row, ['uraian', 'keterangan'], '-'),
          pj: extractTextField(row, ['penanggung_jawab', 'pj'], '-'),
          arah,
          nominal,
          saldo: b2Saldo,
        });
      }
    });

    return {
      absen: {
        rows: absenRekap,
        totals: absenTotals,
        persenTotal: absenPersenTotal,
      },
      buku1: {
        jatahMasuk: b1JatahMasuk,
        belanjaPagiSore: b1BelanjaPagiSore,
        subsidiMasuk: b1SubsidiMasuk,
        sisaSaldo: b1Saldo,
        mutations: b1Mutations,
      },
      buku2: {
        omzet: b2Omzet,
        modal: b2Modal,
        subsidiKeluar: b2SubsidiKeluar,
        saldoBersih: b2Saldo,
        transactions: b2Transactions,
      },
    };
  }, [
    activeRange,
    extraRaw.dapurAbsenRows,
    extraRaw.dapurBukuMasakRows,
    extraRaw.dapurJualanMalamRows,
    pengaturanApproval.tahun_ajaran_aktif,
    pengurusRows,
    todayStr,
  ]);

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
    const aktifAll = pengurusRows.filter(
      (p) => !p.status || p.status.trim().toLowerCase() === 'aktif'
    );
    const matchedTa = activeTa ? aktifAll.filter((p) => p.masa_khidmat === activeTa) : [];
    const sourcePeople = matchedTa.length > 0 ? matchedTa : aktifAll;

    const matchDewanHarianRole = (rawJabatan: string, targetSlot: string): boolean => {
      const j = (rawJabatan || '').trim().toLowerCase();
      const t = targetSlot.toLowerCase();
      const isWakil = j.includes('wakil');
      if (t === 'kepala pondok') {
        return !isWakil && (j.includes('kepala pondok') || j.includes('ketua pondok'));
      }
      if (t === 'wakil kepala pondok') {
        return isWakil && (j.includes('kepala pondok') || j.includes('ketua pondok'));
      }
      if (t === 'sekretaris') {
        return !isWakil && j.includes('sekretaris');
      }
      if (t === 'wakil sekretaris') {
        return isWakil && j.includes('sekretaris');
      }
      if (t === 'bendahara') {
        return !isWakil && j.includes('bendahara');
      }
      if (t === 'wakil bendahara') {
        return isWakil && j.includes('bendahara');
      }
      return false;
    };

    const dewanHarianSlots = DEWAN_HARIAN_ORDER.map((jabatan, index) => {
      const names: string[] = [];
      for (const person of sourcePeople) {
        for (const jab of person.jabatan_list) {
          if (isExcludedTopLeadership(jab.divisi, jab.nama_jabatan)) continue;
          if (
            normalizeDivisiName(jab.divisi).toLowerCase() === 'dewan harian' &&
            matchDewanHarianRole(jab.nama_jabatan, jabatan)
          ) {
            if (!names.includes(person.nama_lengkap)) {
              names.push(person.nama_lengkap);
            }
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
    const aktifAll = pengurusRows.filter(
      (p) => !p.status || p.status.trim().toLowerCase() === 'aktif'
    );
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
    const formatUnpaidMonthsCompact = (yms: string[]): string => {
      if (yms.length === 0) return '-';
      const sorted = [...yms].sort();
      const toMonthIdx = (ym: string) => {
        const [yy, mm] = ym.split('-').map(Number);
        return yy * 12 + (mm - 1);
      };
      const parts: string[] = [];
      let runStart = sorted[0];
      let runEnd = sorted[0];
      const flushRun = (s: string, e: string) => {
        if (s === e) {
          parts.push(formatYmShort(s));
        } else {
          const [sy, sm] = s.split('-').map(Number);
          const [ey, em] = e.split('-').map(Number);
          const sMon = BULAN_SHORT[Math.max(0, Math.min(11, sm - 1))];
          const eMon = BULAN_SHORT[Math.max(0, Math.min(11, em - 1))];
          if (sy === ey) {
            parts.push(`${sMon}–${eMon} ${String(ey).slice(-2)}`);
          } else {
            parts.push(`${sMon} ${String(sy).slice(-2)}–${eMon} ${String(ey).slice(-2)}`);
          }
        }
      };
      for (let i = 1; i < sorted.length; i += 1) {
        if (toMonthIdx(sorted[i]) === toMonthIdx(runEnd) + 1) {
          runEnd = sorted[i];
        } else {
          flushRun(runStart, runEnd);
          runStart = sorted[i];
          runEnd = sorted[i];
        }
      }
      flushRun(runStart, runEnd);
      return parts.join(', ');
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
        bulanMenunggak: formatUnpaidMonthsCompact(unpaidMonths),
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

  const validChartData = useMemo(() => {
    if (!rawData || !bundle || !todayStr) return null;

    const pickMetric = (
      sec: unknown,
      keys: string[]
    ): { cur: number; prev: number } | null => {
      if (!sec || typeof sec !== 'object') return null;
      const rec = sec as Record<string, unknown>;
      for (const k of keys) {
        const v = rec[k];
        if (v && typeof v === 'object' && 'current' in v) {
          const pair = v as { current?: unknown; previous?: unknown };
          return { cur: Number(pair.current) || 0, prev: Number(pair.previous) || 0 };
        }
        if (typeof v === 'number' && Number.isFinite(v)) {
          return { cur: v, prev: 0 };
        }
      }
      for (const [k, v] of Object.entries(rec)) {
        const kl = k.toLowerCase();
        if (keys.some((h) => kl.includes(h.toLowerCase()))) {
          if (v && typeof v === 'object' && 'current' in v) {
            const pair = v as { current?: unknown; previous?: unknown };
            return { cur: Number(pair.current) || 0, prev: Number(pair.previous) || 0 };
          }
          if (typeof v === 'number' && Number.isFinite(v)) {
            return { cur: v, prev: 0 };
          }
        }
      }
      return null;
    };

    const sixWeeks = buildSixWeekWindows(activeRange.end);
    const wkBundles = sixWeeks.map((win) => {
      const wp = computePeriodWindow('rentang', {
        anchorDate: win.end,
        monthStr: win.end.slice(0, 7),
        startDate: win.start,
        endDate: win.end,
        todayStr,
      });
      return {
        win,
        b: buildAllDivisionReports(rawData, wp, todayStr, { canViewBisyaroh }),
      };
    });

    const curRec = bundle as unknown as Record<string, unknown>;

    // Aktivitas Divisi (Periode Ini vs Periode Lalu)
    const izinM = pickMetric(curRec.perizinan, ['totalIzin', 'izin', 'total']) || { cur: 0, prev: 0 };
    const amanM = pickMetric(curRec.keamanan, ['totalKasus', 'kasus', 'pelanggaran', 'total']) || { cur: 0, prev: 0 };
    const sehatM = pickMetric(curRec.kesehatan, ['totalSakit', 'santriSakit', 'totalKasus', 'totalKunjungan', 'kunjungan', 'sakit', 'total']) || { cur: 0, prev: 0 };
    const sarprasM = pickMetric(curRec.sarpras, ['totalLaporan', 'totalTiket', 'laporan', 'tiket', 'aduan', 'total']) || { cur: 0, prev: 0 };
    const giatM = pickMetric(curRec.kegiatan, ['totalAgenda', 'totalKegiatan', 'agenda', 'kegiatan', 'total']) || { cur: 0, prev: 0 };
    const laundryActM = pickMetric(curRec.laundry, ['totalSetoran', 'jumlahSetoran', 'totalTransaksi', 'totalPotong', 'setoran', 'potong', 'total']) || { cur: 0, prev: 0 };

    const aktivitasDivisi = [
      { label: 'Izin Pulang', cur: izinM.cur, prev: izinM.prev },
      { label: 'Pelanggaran', cur: amanM.cur, prev: amanM.prev },
      { label: 'Santri Sakit', cur: sehatM.cur, prev: sehatM.prev },
      { label: 'Laporan Sarpras', cur: sarprasM.cur, prev: sarprasM.prev },
      { label: 'Agenda Kegiatan', cur: giatM.cur, prev: giatM.prev },
      { label: 'Setoran Laundry', cur: laundryActM.cur, prev: laundryActM.prev },
    ];

    // Keuangan Tunai & Transfer (dari bundle.keuangan atau fallback transaksi riil)
    let mTunai = pickMetric(curRec.keuangan, ['masukTunai', 'tunaiMasuk']);
    let mTrans = pickMetric(curRec.keuangan, ['masukTransfer', 'transferMasuk']);
    let kTunai = pickMetric(curRec.keuangan, ['keluarTunai', 'tunaiKeluar']);
    let kTrans = pickMetric(curRec.keuangan, ['keluarTransfer', 'transferKeluar']);

    if ((!mTunai || !mTrans) && extraRaw.keuanganTransaksiRows.length > 0) {
      const { start, end, prevStart, prevEnd } = activeRange;
      let mtC = 0; let mtP = 0;
      let mtrC = 0; let mtrP = 0;
      let ktC = 0; let ktP = 0;
      let ktrC = 0; let ktrP = 0;
      for (const row of extraRaw.keuanganTransaksiRows) {
        const iso = extractRowDateIso(row);
        if (!iso) continue;
        const isCur = iso >= start && iso <= end;
        const isPrev = iso >= prevStart && iso <= prevEnd;
        if (!isCur && !isPrev) continue;
        const amt = extractNumericField(row, ['nominal', 'jumlah', 'total']);
        const jenis = `${String(row.tipe || '')} ${String(row.jenis || '')}`.toLowerCase();
        const isKeluar = /keluar|out|beban|biaya|pengeluaran/.test(jenis);
        const metode = `${String(row.metode || '')} ${String(row.metode_pembayaran || '')} ${String(row.sumber_dana || '')} ${String(row.akun || '')} ${String(row.kas || '')}`.toLowerCase();
        const isTransfer = /transfer|bank|rekening|qris|tf|bri|bca|bsi|mandiri/.test(metode);
        if (isKeluar) {
          if (isTransfer) { if (isCur) ktrC += amt; else ktrP += amt; }
          else { if (isCur) ktC += amt; else ktP += amt; }
        } else {
          if (isTransfer) { if (isCur) mtrC += amt; else mtrP += amt; }
          else { if (isCur) mtC += amt; else mtP += amt; }
        }
      }
      if (!mTunai) mTunai = { cur: mtC, prev: mtP };
      if (!mTrans) mTrans = { cur: mtrC, prev: mtrP };
      if (!kTunai) kTunai = { cur: ktC, prev: ktP };
      if (!kTrans) kTrans = { cur: ktrC, prev: ktrP };
    }

    const keuanganMetode = [
      { label: 'Masuk Tunai', cur: mTunai?.cur ?? 0, prev: mTunai?.prev ?? 0 },
      { label: 'Masuk Transfer', cur: mTrans?.cur ?? 0, prev: mTrans?.prev ?? 0 },
      { label: 'Keluar Tunai', cur: kTunai?.cur ?? 0, prev: kTunai?.prev ?? 0 },
      { label: 'Keluar Transfer', cur: kTrans?.cur ?? 0, prev: kTrans?.prev ?? 0 },
    ];

    // Kedisiplinan Dapur (%) - HANYA Masak Tepat Waktu & Hadir Petugas Dapur (tanpa Jamaah)
    const masakM = pickMetric(curRec.dapur, ['persenTepatWaktu', 'tepatWaktu', 'masakTepatWaktu']) || { cur: 0, prev: 0 };
    const petugasM = pickMetric(curRec.dapur, ['persenHadirPetugas', 'persenPetugas', 'hadirPetugas', 'petugasHadir', 'kehadiranPetugas', 'persenHadir']) || { cur: 0, prev: 0 };
    const dapurKedisiplinan = [
      { label: 'Masak Tepat Waktu', cur: Math.min(100, Math.round(masakM.cur)), prev: Math.min(100, Math.round(masakM.prev)) },
      { label: 'Hadir Petugas Dapur', cur: Math.min(100, Math.round(petugasM.cur)), prev: Math.min(100, Math.round(petugasM.prev)) },
    ];

    // Tren 6 Pekan per Divisi
    const mapWeekly = (
      extractor: (wb: Record<string, unknown>) => number,
      formatter: (v: number) => string
    ) =>
      wkBundles.map(({ win, b }) => {
        const val = extractor(b as unknown as Record<string, unknown>);
        return {
          shortLabel: win.shortLabel,
          value: val,
          valueText: formatter(val),
        };
      });

    return {
      aktivitasDivisi,
      keuanganMetode,
      dapurKedisiplinan,
      weekly: {
        keuanganPemasukan: mapWeekly(
          (wb) => pickMetric(wb.keuangan, ['masukTotal', 'totalMasuk', 'pemasukan'])?.cur ?? 0,
          (v) => formatCompactRupiah(v)
        ),
        perizinan: mapWeekly(
          (wb) => pickMetric(wb.perizinan, ['totalIzin', 'izin', 'total'])?.cur ?? 0,
          (v) => `${v}`
        ),
        keamanan: mapWeekly(
          (wb) => pickMetric(wb.keamanan, ['totalKasus', 'kasus', 'pelanggaran', 'total'])?.cur ?? 0,
          (v) => `${v}`
        ),
        jamaah: mapWeekly(
          (wb) => Math.min(100, Math.round(pickMetric(wb.jamaah, ['persenHadir', 'kehadiran', 'persen'])?.cur ?? 0)),
          (v) => `${v}%`
        ),
        kesehatan: mapWeekly(
          (wb) => pickMetric(wb.kesehatan, ['totalSakit', 'santriSakit', 'totalKasus', 'totalKunjungan', 'kunjungan', 'sakit', 'total'])?.cur ?? 0,
          (v) => `${v}`
        ),
        dapur: mapWeekly(
          (wb) => Math.min(100, Math.round(pickMetric(wb.dapur, ['persenTepatWaktu', 'tepatWaktu', 'masakTepatWaktu'])?.cur ?? 0)),
          (v) => `${v}%`
        ),
        laundryPotong: mapWeekly(
          (wb) => pickMetric(wb.laundry, ['totalPotong', 'potong', 'totalSetoran', 'total'])?.cur ?? 0,
          (v) => `${v}`
        ),
        laundrySetoran: mapWeekly(
          (wb) => pickMetric(wb.laundry, ['totalSetoran', 'jumlahSetoran', 'totalTransaksi', 'totalPotong', 'total'])?.cur ?? 0,
          (v) => `${v}`
        ),
      },
    };
  }, [rawData, bundle, todayStr, activeRange, canViewBisyaroh, extraRaw.keuanganTransaksiRows]);

  useLayoutEffect(() => {
    const docRoot = docWrapperRef.current;
    const personaliaSource = personaliaSourceRef.current;
    const approvalSource = approvalSourceRef.current;
    const tunggakanTableSource = tunggakanTableSourceRef.current;
    const perizinanTableSource = perizinanTableSourceRef.current;
    const kegiatanTableSource = kegiatanTableSourceRef.current;
    const kegiatanFotoSource = kegiatanFotoSourceRef.current;
    const dapurExtraSource = dapurExtraSourceRef.current;
    const extraSource = extraSourceRef.current;

    const cleanupDomPatches = () => {
      if (docRoot) {
        docRoot
          .querySelectorAll(
            '[data-siap-personalia-clone="true"], [data-siap-approval-clone="true"], [data-siap-extra-clone="true"], [data-siap-kamar-grid="true"], [data-siap-kegiatan-table-clone="true"], [data-siap-kegiatan-foto-clone="true"], [data-siap-dapur-extra-clone="true"], [data-siap-chart-clone="true"], [data-siap-std-chart="true"], [data-siap-dapur-trend-inject="true"], [data-siap-kamar-total="true"], [data-siap-perizinan-clone="true"], [data-siap-tunggakan-clone="true"], [data-siap-cakupan-clone="true"], [data-siap-reordered-col-clone="true"]'
          )
          .forEach((node) => node.remove());
        docRoot
          .querySelectorAll<HTMLTableSectionElement>('tbody')
          .forEach((tb) => {
            const rec = tb as unknown as { __siapOrigRows?: Element[] };
            if (Array.isArray(rec.__siapOrigRows)) {
              rec.__siapOrigRows.forEach((r) => tb.appendChild(r));
              delete rec.__siapOrigRows;
            }
          });
        docRoot
          .querySelectorAll('[data-siap-sorted-asc="true"]')
          .forEach((node) => node.removeAttribute('data-siap-sorted-asc'));
        docRoot
          .querySelectorAll('[data-siap-hidden-cover-author="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-cover-author'));
        docRoot
          .querySelectorAll('[data-siap-cover-date-right="true"]')
          .forEach((node) => node.removeAttribute('data-siap-cover-date-right'));
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
          .querySelectorAll('[data-siap-hidden-cakupan="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-cakupan'));
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
          .querySelectorAll('[data-siap-hidden-kegiatan-list="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-kegiatan-list'));
        docRoot
          .querySelectorAll('[data-siap-hidden-kegiatan-foto="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-kegiatan-foto'));
        docRoot
          .querySelectorAll('[data-siap-hidden-dup="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-dup'));
        docRoot
          .querySelectorAll('[data-siap-hidden-signature="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-signature'));
        docRoot
          .querySelectorAll('[data-siap-hidden-chart="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-chart'));
        docRoot
          .querySelectorAll<HTMLElement>('[data-siap-hidden-orig-chart="true"]')
          .forEach((node) => {
            node.style.display = '';
            node.removeAttribute('data-siap-hidden-orig-chart');
          });
        docRoot
          .querySelectorAll('[data-siap-exec-section="true"]')
          .forEach((node) => node.removeAttribute('data-siap-exec-section'));
        docRoot
          .querySelectorAll('[data-siap-kpi-grid="true"]')
          .forEach((node) => node.removeAttribute('data-siap-kpi-grid'));
        docRoot
          .querySelectorAll('[data-siap-kpi-card="true"]')
          .forEach((node) => node.removeAttribute('data-siap-kpi-card'));
        docRoot
          .querySelectorAll('[data-siap-std-6w="true"]')
          .forEach((node) => node.removeAttribute('data-siap-std-6w'));
        docRoot
          .querySelectorAll('[data-siap-std-paired="true"]')
          .forEach((node) => node.removeAttribute('data-siap-std-paired'));
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
        docRoot
          .querySelectorAll('[data-siap-cat-label="true"]')
          .forEach((node) => node.removeAttribute('data-siap-cat-label'));
      }
    };

    cleanupDomPatches();

    if (loading || !bundle) {
      return cleanupDomPatches;
    }

    const enforceReportFontFloor = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>('[data-siap-xaxis-label="true"]').forEach((el) => {
        el.style.fontSize = '8pt';
        el.style.lineHeight = '1.25';
        el.style.whiteSpace = 'nowrap';
      });
      root.querySelectorAll<HTMLElement>('[data-siap-cat-label="true"]').forEach((el) => {
        el.style.fontSize = '8pt';
        el.style.lineHeight = '1.25';
        el.style.whiteSpace = 'normal';
        el.style.overflowWrap = 'break-word';
      });
      root.querySelectorAll<SVGElement>('svg text, svg tspan').forEach((svgTxt) => {
        if (
          svgTxt.hasAttribute('data-siap-xaxis-label') ||
          svgTxt.closest('[data-siap-xaxis-label="true"]')
        ) {
          svgTxt.style.fontSize = '8pt';
          svgTxt.style.whiteSpace = 'nowrap';
          return;
        }
        svgTxt.style.fontSize = '8pt';
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

    // 0. Ganti istilah "Tiket Sarpras" -> "Laporan Sarpras", "(0 tiket)" -> "(0 laporan)", "Sie Koprasi" -> "Sie Koperasi", serta bersihkan [IZIN_META:{...}] / tidak_menginap
    const textWalker = document.createTreeWalker(searchContainer, NodeFilter.SHOW_TEXT);
    const textNodesToUpdate: Text[] = [];
    let walkedNode = textWalker.nextNode();
    while (walkedNode) {
      if (
        walkedNode.nodeValue &&
        /tiket\s+sarpras|\(\s*\d+\s*tiket\s*\)|\b\d+\s+tiket\b|\[IZIN_META:|tidak_menginap|sie\s+koprasi/i.test(
          walkedNode.nodeValue
        )
      ) {
        textNodesToUpdate.push(walkedNode as Text);
      }
      walkedNode = textWalker.nextNode();
    }
    for (const tNode of textNodesToUpdate) {
      if (tNode.nodeValue) {
        let updated = tNode.nodeValue
          .replace(/tiket\s+sarpras/gi, 'Laporan Sarpras')
          .replace(/(\(\s*\d+\s*)tiket(\s*\))/gi, '$1laporan$2')
          .replace(/(\b\d+\s+)tiket\b/gi, '$1laporan')
          .replace(/\bSie\s+Koprasi\b/gi, 'Sie Koperasi');
        if (/\[IZIN_META:|tidak_menginap/i.test(updated)) {
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

    // Ganti / sinkronkan Lembar Pengesahan agar TTD & Stempel Digital tampil proporsional & tidak terpotong
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

    // Setiap Bab Romawi (I s/d X) selalu dimulai di halaman baru (Bab I mengikuti cover jika cover tampil)
    outermostDivSections.forEach((divEl, idx) => {
      const hasPrevContent = idx > 0 || showCoverAndApproval;
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
    const div5El = findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+V\b|^\s*V[.\s·:-]+).*(?:Keamanan|Pelanggaran)/i);
    const div6El = findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+VI\b|^\s*VI[.\s·:-]+).*(?:Jamaah|Sholat)/i);
    const div7El = findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+VII\b|^\s*VII[.\s·:-]+).*(?:Kesehatan|Poskestren)/i);
    const div8El = findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+VIII\b|^\s*VIII[.\s·:-]+).*(?:Dapur)/i);
    const div9El = findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+IX\b|^\s*IX[.\s·:-]+).*(?:Sarana|Prasarana|Sarpras)/i);
    const div10El = findDivByMatcher(/(?:\b(?:Divisi|Bab)\s+X\b|^\s*X[.\s·:-]+).*(?:Laundry)/i);

    if (div9El) {
      const d9Walker = document.createTreeWalker(div9El, NodeFilter.SHOW_TEXT);
      const d9Nodes: Text[] = [];
      let d9Cur = d9Walker.nextNode();
      while (d9Cur) {
        if (d9Cur.nodeValue && /\btiket\b/i.test(d9Cur.nodeValue)) {
          d9Nodes.push(d9Cur as Text);
        }
        d9Cur = d9Walker.nextNode();
      }
      d9Nodes.forEach((n) => {
        if (n.nodeValue) {
          n.nodeValue = n.nodeValue.replace(/\btiket\b/gi, (m) =>
            m.charAt(0) === 'T' ? 'Laporan' : 'laporan'
          );
        }
      });
    }

    // Pastikan Bab I memiliki break-before-page jika berada tepat setelah Cover agar Halaman 2 langsung Bab I
    if (div1ScopeEl && showCoverAndApproval) {
      div1ScopeEl.setAttribute('data-siap-page-start', 'true');
      if (!div1ScopeEl.classList.contains('break-before-page')) {
        div1ScopeEl.classList.add('break-before-page', 'print:break-before-page');
        div1ScopeEl.setAttribute('data-siap-added-break-cls', 'true');
      }
    }

    // 0a. Perbaiki daftar "CAKUPAN DATA LAPORAN" di halaman Cover agar lengkap, berurutan I. sampai XIII., dan mengalir ke bawah per kolom
    if (showCoverAndApproval) {
      const COVER_CAKUPAN_LIST: Array<{ key: ExtendedDivisionKey; label: string }> = [
        { key: 'administrasi', label: 'I. Administrasi & Santri' },
        { key: 'keuangan', label: 'II. Keuangan Pesantren' },
        { key: 'kegiatan', label: 'III. Kegiatan Pondok' },
        { key: 'perizinan', label: 'IV. Perizinan Pulang' },
        { key: 'keamanan', label: 'V. Keamanan & Pelanggaran' },
        { key: 'jamaah', label: 'VI. Absen Sholat Jamaah' },
        { key: 'kesehatan', label: 'VII. Kesehatan (Poskestren)' },
        { key: 'dapur', label: 'VIII. Dapur & Konsumsi' },
        { key: 'sarpras', label: 'IX. Sarana & Prasarana' },
        { key: 'laundry', label: 'X. Sie Laundry Pondok' },
        { key: 'kebersihan', label: 'XI. Kebersihan & Piket' },
        { key: 'koperasi', label: 'XII. Koperasi Pondok' },
        { key: 'psb', label: 'XIII. Pendaftaran Santri Baru (PSB)' },
      ];
      const activeCakupanItems =
        scope === 'gabungan'
          ? selectedDivisions.length >= ALL_DIV_KEYS.length
            ? COVER_CAKUPAN_LIST
            : COVER_CAKUPAN_LIST.filter((item) => selectedDivisions.includes(item.key))
          : COVER_CAKUPAN_LIST.filter((item) => item.key === scope);

      const cakupanContainers = Array.from(
        searchContainer.querySelectorAll<HTMLElement>('div, section')
      ).filter((el) => {
        if (el === searchContainer) return false;
        if (approvalEl && (el === approvalEl || el.contains(approvalEl))) return false;
        if (outermostDivSections.some((d) => d === el || d.contains(el) || el.contains(d))) return false;
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return /cakupan\s+data\s+laporan/i.test(txt) && txt.length < 2200 && el.children.length >= 2;
      });
      const targetCakupanWrap =
        cakupanContainers.find(
          (cand) => !cakupanContainers.some((other) => other !== cand && cand.contains(other))
        ) || null;

      if (targetCakupanWrap) {
        const kids = Array.from(targetCakupanWrap.children) as HTMLElement[];
        const headingChild =
          kids.find((k) => /cakupan\s+data\s+laporan/i.test((k.textContent || '').trim())) ||
          kids[0];
        kids.forEach((k) => {
          if (k !== headingChild) {
            k.setAttribute('data-siap-hidden-cakupan', 'true');
          }
        });
        const cakupanGrid = document.createElement('div');
        cakupanGrid.setAttribute('data-siap-cakupan-clone', 'true');
        cakupanGrid.className =
          'grid grid-cols-3 gap-x-6 gap-y-1 items-start text-[8.5pt] leading-snug text-slate-700 mt-2';

        const col1Count = activeCakupanItems.length === 13 ? 5 : Math.ceil(activeCakupanItems.length / 3);
        const col2Count =
          activeCakupanItems.length === 13
            ? 5
            : Math.ceil((activeCakupanItems.length - col1Count) / 2);
        const colSlices = [
          activeCakupanItems.slice(0, col1Count),
          activeCakupanItems.slice(col1Count, col1Count + col2Count),
          activeCakupanItems.slice(col1Count + col2Count),
        ];

        colSlices.forEach((colItems) => {
          const colDiv = document.createElement('div');
          colDiv.className = 'space-y-1 min-w-0';
          colItems.forEach((item) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'font-medium text-slate-800';
            itemEl.textContent = item.label;
            colDiv.appendChild(itemEl);
          });
          cakupanGrid.appendChild(colDiv);
        });
        targetCakupanWrap.appendChild(cakupanGrid);
      }

      // 0a-2. Hapus total "Disusun oleh: ..." pada halaman Cover dan sisakan "Dicetak: ..." di sisi kanan bawah
      const firstBabNode = outermostDivSections[0] || div1ScopeEl || null;
      const isInCoverArea = (el: HTMLElement): boolean => {
        if (el === searchContainer) return false;
        if (outermostDivSections.some((d) => el === d || d.contains(el) || el.contains(d))) return false;
        if (approvalEl && (el === approvalEl || approvalEl.contains(el) || el.contains(approvalEl))) return false;
        if (
          firstBabNode &&
          !(el.compareDocumentPosition(firstBabNode) & Node.DOCUMENT_POSITION_FOLLOWING)
        ) {
          return false;
        }
        return true;
      };

      const authorBlocks = Array.from(
        searchContainer.querySelectorAll<HTMLElement>('div, p, span, footer, section')
      ).filter((el) => {
        if (!isInCoverArea(el)) return false;
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!txt || txt.length > 450) return false;
        if (/cakupan\s+data\s+laporan|laporan\s+gabungan\s+pengurus/i.test(txt)) return false;
        if (/dicetak\s*:/i.test(txt)) return false;
        return /disusun\s+oleh/i.test(txt);
      });

      const outermostAuthorBlocks = authorBlocks.filter(
        (cand) => !authorBlocks.some((other) => other !== cand && cand.contains(other))
      );

      outermostAuthorBlocks.forEach((blk) => {
        blk.setAttribute('data-siap-hidden-cover-author', 'true');
        const parent = blk.parentElement;
        if (parent && isInCoverArea(parent)) {
          const sibs = Array.from(parent.children) as HTMLElement[];
          const dateSib = sibs.find(
            (s) => s !== blk && /dicetak\s*:/i.test((s.textContent || '').trim())
          );
          if (dateSib) {
            dateSib.setAttribute('data-siap-cover-date-right', 'true');
          }
        }
      });

      // Fallback apabila "Disusun oleh:" dan "Dicetak:" berada dalam elemen yang sama tanpa pembungkus terpisah
      Array.from(searchContainer.querySelectorAll<HTMLElement>('div, p, span')).forEach((el) => {
        if (!isInCoverArea(el)) return;
        if (el.closest('[data-siap-hidden-cover-author="true"]')) return;
        if (el.children.length > 0) return;
        const rawTxt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (/disusun\s+oleh/i.test(rawTxt) && /dicetak\s*:/i.test(rawTxt)) {
          if (!el.hasAttribute('data-siap-orig-text')) {
            el.setAttribute('data-siap-orig-text', el.textContent || '');
          }
          const onlyDate = rawTxt.replace(/^[\s\S]*?(Dicetak\s*:[\s\S]*)$/i, '$1').trim();
          el.textContent = onlyDate;
          el.setAttribute('data-siap-cover-date-right', 'true');
        }
      });

      // Pastikan elemen "Dicetak: ..." di Cover tetap berada di sisi kanan bawah
      Array.from(searchContainer.querySelectorAll<HTMLElement>('div, p, span')).forEach((el) => {
        if (!isInCoverArea(el)) return;
        if (el.closest('[data-siap-hidden-cover-author="true"]')) return;
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (/^dicetak\s*:/i.test(txt) && txt.length < 120 && el.children.length <= 2) {
          el.setAttribute('data-siap-cover-date-right', 'true');
        }
      });
    }

    // 0b. Penataan Grafik di Ringkasan Eksekutif -> Pindahkan ke Bab II (Keuangan) & Bab VIII (Dapur)
    const execCandidates = allSectionDivs.filter((el) => {
      if (el === searchContainer) return false;
      if (approvalEl && (el === approvalEl || el.contains(approvalEl))) return false;
      if (outermostDivSections.some((d) => el === d || el.contains(d) || d.contains(el))) return false;
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
    if (execSectionEl) {
      execSectionEl.setAttribute('data-siap-exec-section', 'true');
    }

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

    const parseDisplayNumeric = (raw: string): number => {
      const cleaned = (raw || '').replace(/\s+/g, ' ').trim();
      if (!cleaned) return 0;
      const jtMatch = cleaned.match(/([\d.,]+)\s*jt/i);
      if (jtMatch) {
        const num = parseFloat(jtMatch[1].replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(num) ? Math.round(num * 1_000_000) : 0;
      }
      const rbMatch = cleaned.match(/([\d.,]+)\s*(?:rb|k)\b/i);
      if (rbMatch) {
        const num = parseFloat(rbMatch[1].replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(num) ? Math.round(num * 1_000) : 0;
      }
      const digitsOnly = cleaned.replace(/[^\d.,-]/g, '');
      if (!digitsOnly) return 0;
      if (/^\d{1,3}(?:\.\d{3})+$/.test(digitsOnly)) {
        return Number(digitsOnly.replace(/\./g, '')) || 0;
      }
      const parsed = parseFloat(digitsOnly.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const createGuideLinesBackdrop = (): HTMLElement => {
      const guides = document.createElement('div');
      guides.className =
        'pointer-events-none absolute inset-x-0 top-7 bottom-5 flex flex-col justify-between z-0';
      for (let i = 0; i < 3; i += 1) {
        const line = document.createElement('div');
        line.className = 'border-t border-dashed border-slate-200/90 w-full';
        guides.appendChild(line);
      }
      return guides;
    };

    type ChartScaleMode = 'count' | 'percent' | 'rupiah';

    const buildSixWeekBarEl = (
      points: Array<{ shortLabel: string; value: number; valueText: string; color?: string }>,
      scaleMode: ChartScaleMode
    ): HTMLElement => {
      const values = points.map((p) => Math.max(0, p.value));
      const maxScale =
        scaleMode === 'percent'
          ? 100
          : scaleMode === 'count'
          ? Math.max(5, ...values)
          : Math.max(1, ...values);

      const outerRel = document.createElement('div');
      outerRel.setAttribute('data-siap-std-chart', 'true');
      outerRel.className = 'relative pt-2';
      outerRel.appendChild(createGuideLinesBackdrop());

      const gridEl = document.createElement('div');
      gridEl.className = 'relative z-10 grid grid-cols-6 gap-2.5 items-end';

      points.forEach((pt) => {
        const col = document.createElement('div');
        col.className = 'flex flex-col items-center gap-1 min-w-0';

        const valSpan = document.createElement('span');
        valSpan.className =
          'text-[8pt] font-bold text-slate-800 tabular-nums text-center leading-tight whitespace-nowrap';
        valSpan.textContent = pt.valueText;

        const plot = document.createElement('div');
        plot.className =
          'w-full h-24 border-b border-slate-300 flex items-end justify-center px-1.5';

        const bar = document.createElement('div');
        if (pt.value > 0) {
          const pct =
            scaleMode === 'percent'
              ? Math.min(100, Math.max(4, Math.round(pt.value)))
              : Math.max(8, Math.round((pt.value / maxScale) * 100));
          bar.className = 'w-full max-w-[34px] rounded-t-md transition-all';
          bar.style.height = `${pct}%`;
          bar.style.backgroundColor = pt.color || '#059669';
        } else {
          bar.className = 'w-full max-w-[34px] h-[2px] rounded-full bg-slate-300';
        }
        plot.appendChild(bar);

        const xSpan = document.createElement('span');
        xSpan.setAttribute('data-siap-xaxis-label', 'true');
        xSpan.className =
          'block text-[8pt] font-semibold text-slate-700 text-center leading-tight whitespace-nowrap';
        xSpan.textContent = pt.shortLabel;

        col.appendChild(valSpan);
        col.appendChild(plot);
        col.appendChild(xSpan);
        gridEl.appendChild(col);
      });

      outerRel.appendChild(gridEl);
      return outerRel;
    };

    const buildPairedBarEl = (
      cats: Array<{
        label: string;
        cur: number;
        prev: number;
        curText: string;
        prevText: string;
        curColor?: string;
        prevColor?: string;
      }>,
      scaleMode: ChartScaleMode,
      includeLegend: boolean
    ): HTMLElement => {
      const allVals = cats.flatMap((c) => [Math.max(0, c.cur), Math.max(0, c.prev)]);
      const maxScale =
        scaleMode === 'percent'
          ? 100
          : scaleMode === 'count'
          ? Math.max(5, ...allVals)
          : Math.max(1, ...allVals);

      const wrap = document.createElement('div');
      wrap.setAttribute('data-siap-std-chart', 'true');
      wrap.className = 'space-y-2 pt-1';

      if (includeLegend) {
        const legendRow = document.createElement('div');
        legendRow.className =
          'flex items-center justify-end gap-3 text-[8pt] leading-tight font-semibold text-slate-600';
        legendRow.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background-color:${cats[0]?.curColor || '#059669'}"></span>Periode Ini</span><span class="inline-flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background-color:${cats[0]?.prevColor || '#94a3b8'}"></span>Periode Lalu</span>`;
        wrap.appendChild(legendRow);
      }

      const outerRel = document.createElement('div');
      outerRel.className = 'relative pt-2';
      outerRel.appendChild(createGuideLinesBackdrop());

      const gridEl = document.createElement('div');
      gridEl.className = 'relative z-10 grid gap-2.5 items-end';
      gridEl.style.gridTemplateColumns = `repeat(${Math.max(1, cats.length)}, minmax(0, 1fr))`;

      cats.forEach((cat) => {
        const col = document.createElement('div');
        col.className = 'flex flex-col items-center gap-1 min-w-0';

        const valRow = document.createElement('div');
        valRow.className = 'grid grid-cols-2 gap-1.5 w-full';

        const v1 = document.createElement('span');
        v1.className =
          'text-[8pt] font-bold text-center tabular-nums leading-tight text-slate-900 whitespace-nowrap';
        v1.textContent = cat.curText;

        const v2 = document.createElement('span');
        v2.className =
          'text-[8pt] font-bold text-center tabular-nums leading-tight text-slate-500 whitespace-nowrap';
        v2.textContent = cat.prevText;

        valRow.appendChild(v1);
        valRow.appendChild(v2);

        const plot = document.createElement('div');
        plot.className =
          'w-full h-24 border-b border-slate-300 grid grid-cols-2 gap-1.5 items-end px-1.5';

        const makeBar = (val: number, color: string) => {
          const bar = document.createElement('div');
          if (val > 0) {
            const pct =
              scaleMode === 'percent'
                ? Math.min(100, Math.max(4, Math.round(val)))
                : Math.max(8, Math.round((val / maxScale) * 100));
            bar.className = 'w-full rounded-t-md transition-all';
            bar.style.height = `${pct}%`;
            bar.style.backgroundColor = color;
          } else {
            bar.className = 'w-full h-[2px] rounded-full bg-slate-300';
          }
          return bar;
        };

        plot.appendChild(makeBar(cat.cur, cat.curColor || '#059669'));
        plot.appendChild(makeBar(cat.prev, cat.prevColor || '#94a3b8'));

        const lbl = document.createElement('span');
        lbl.setAttribute('data-siap-cat-label', 'true');
        lbl.className =
          'block w-full text-[8pt] leading-tight text-center break-words px-1 font-semibold text-slate-700';
        lbl.textContent = cat.label;

        col.appendChild(valRow);
        col.appendChild(plot);
        col.appendChild(lbl);
        gridEl.appendChild(col);
      });

      outerRel.appendChild(gridEl);
      wrap.appendChild(outerRel);
      return wrap;
    };

    const getSvgOffset = (el: Element, svgRoot: Element): { dx: number; dy: number } => {
      let dx = 0;
      let dy = 0;
      let cur: Element | null = el.parentElement;
      while (cur && cur !== svgRoot) {
        const tf = cur.getAttribute('transform') || '';
        const m = tf.match(/translate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)/);
        if (m) {
          dx += parseFloat(m[1]) || 0;
          dy += parseFloat(m[2] || '0') || 0;
        }
        cur = cur.parentElement;
      }
      return { dx, dy };
    };

    const getSvgRectBox = (
      shape: Element,
      svgRoot: Element
    ): { x: number; y: number; w: number; h: number; cx: number; fill: string } | null => {
      const tag = shape.tagName.toLowerCase();
      const { dx, dy } = getSvgOffset(shape, svgRoot);
      const fill = (shape.getAttribute('fill') || window.getComputedStyle(shape).fill || '').trim();
      if (/^(none|transparent|#fff|#ffffff|rgb\(255,\s*255,\s*255\))$/i.test(fill)) {
        return null;
      }
      if (tag === 'rect') {
        const x = (parseFloat(shape.getAttribute('x') || '0') || 0) + dx;
        const y = (parseFloat(shape.getAttribute('y') || '0') || 0) + dy;
        const w = parseFloat(shape.getAttribute('width') || '0') || 0;
        const h = parseFloat(shape.getAttribute('height') || '0') || 0;
        if (w <= 0 || w > 180) return null;
        return { x, y, w, h, cx: x + w / 2, fill };
      }
      if (tag === 'path') {
        const d = shape.getAttribute('d') || '';
        const nums = Array.from(d.matchAll(/-?\d+(?:\.\d+)?/g)).map((m) => parseFloat(m[0]));
        if (nums.length < 4) return null;
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i + 1 < nums.length; i += 2) {
          xs.push(nums[i] + dx);
          ys.push(nums[i + 1] + dy);
        }
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const w = maxX - minX;
        const h = maxY - minY;
        if (w <= 0 || w > 180) return null;
        return { x: minX, y: minY, w, h, cx: minX + w / 2, fill };
      }
      return null;
    };

    const getSvgTextPos = (txt: SVGTextElement, svgRoot: Element) => {
      const { dx, dy } = getSvgOffset(txt, svgRoot);
      const x = (parseFloat(txt.getAttribute('x') || '0') || 0) + dx;
      const y = (parseFloat(txt.getAttribute('y') || '0') || 0) + dy;
      const text = (txt.textContent || '').replace(/\s+/g, ' ').trim();
      return { el: txt, x, y, text };
    };

    const detectChartDivHint = (card: HTMLElement): string | undefined => {
      if (div2El?.contains(card)) return 'keuangan';
      if (div4El?.contains(card)) return 'perizinan';
      if (div5El?.contains(card)) return 'keamanan';
      if (div6El?.contains(card)) return 'jamaah';
      if (div7El?.contains(card)) return 'kesehatan';
      if (div8El?.contains(card)) return 'dapur';
      if (div10El?.contains(card)) return 'laundry';
      if (execSectionEl?.contains(card)) return 'aktivitas';
      return undefined;
    };

    const standardizeChartCard = (card: HTMLElement, explicitHint?: string) => {
      if (
        card.hasAttribute('data-siap-hidden-chart') ||
        card.hasAttribute('data-siap-std-6w') ||
        card.hasAttribute('data-siap-std-paired')
      ) {
        return;
      }
      const divHint = explicitHint || detectChartDivHint(card);
      const fullTxt = (card.textContent || '').replace(/\s+/g, ' ').trim();
      const isSixWeekCard =
        /tren\s*6\s*(?:pekan|minggu)|6\s*(?:pekan|minggu)\s*terakhir|tren\s+ketepatan\s+masak|-5\s*prd/i.test(
          fullTxt
        );
      const isPairedCard =
        !isSixWeekCard &&
        ((/periode\s+ini/i.test(fullTxt) && /periode\s+lalu/i.test(fullTxt)) ||
          /perbandingan\s+(?:aktivitas\s+divisi|keuangan|kedisiplinan)|kedisiplinan\s+operasional\s+dapur/i.test(
            fullTxt
          ));

      const svg = Array.from(card.querySelectorAll('svg')).find(
        (s) => !s.classList.contains('lucide')
      );

      const hideVizTarget = (targetEl: Element) => {
        if (targetEl instanceof HTMLElement) {
          targetEl.setAttribute('data-siap-hidden-orig-chart', 'true');
          targetEl.style.display = 'none';
        } else {
          (targetEl as SVGElement).setAttribute('data-siap-hidden-orig-chart', 'true');
          (targetEl as SVGElement).style.display = 'none';
        }
      };

      // 1. STANDARISASI GRAFIK TREN 6 PEKAN (Valid dari database + batang bersih tanpa kotak border)
      if (isSixWeekCard) {
        let validWeekly: Array<{ shortLabel: string; value: number; valueText: string }> | null = null;
        let scaleMode: ChartScaleMode = 'count';

        if (validChartData) {
          if (divHint === 'keuangan' || /pemasukan|keuangan/i.test(fullTxt)) {
            validWeekly = validChartData.weekly.keuanganPemasukan;
            scaleMode = 'rupiah';
          } else if (divHint === 'perizinan' || /izin|perizinan/i.test(fullTxt)) {
            validWeekly = validChartData.weekly.perizinan;
            scaleMode = 'count';
          } else if (divHint === 'keamanan' || /pelanggaran|keamanan|kasus/i.test(fullTxt)) {
            validWeekly = validChartData.weekly.keamanan;
            scaleMode = 'count';
          } else if (divHint === 'jamaah' || /jamaah|sholat/i.test(fullTxt)) {
            validWeekly = validChartData.weekly.jamaah;
            scaleMode = 'percent';
          } else if (divHint === 'kesehatan' || /sakit|kesehatan|poskestren/i.test(fullTxt)) {
            validWeekly = validChartData.weekly.kesehatan;
            scaleMode = 'count';
          } else if (divHint === 'dapur' || /dapur|masak/i.test(fullTxt)) {
            validWeekly = validChartData.weekly.dapur;
            scaleMode = 'percent';
          } else if (divHint === 'laundry' || /laundry/i.test(fullTxt)) {
            validWeekly =
              /setoran/i.test(fullTxt) && !/potong|pcs/i.test(fullTxt)
                ? validChartData.weekly.laundrySetoran
                : validChartData.weekly.laundryPotong;
            scaleMode = 'count';
          }
        }

        // Fallback baca SVG jika bukan salah satu divisi di atas
        if (!validWeekly && svg) {
          const allSvgTexts = Array.from(svg.querySelectorAll<SVGTextElement>('text'))
            .map((t) => getSvgTextPos(t, svg))
            .filter((t) => t.text.length > 0);
          const maxY = allSvgTexts.length > 0 ? Math.max(...allSvgTexts.map((t) => t.y)) : 0;

          let xTicks = allSvgTexts.filter(
            (t) =>
              t.y >= maxY - 22 &&
              /prd|pekan|minggu|kini|\d{1,2}[\/-]\d{1,2}/i.test(t.text)
          );
          if (xTicks.length !== 6) {
            const rechartsTicks = Array.from(
              svg.querySelectorAll<SVGTextElement>('.recharts-xAxis text, .recharts-cartesian-axis-tick text')
            )
              .map((t) => getSvgTextPos(t, svg))
              .filter((t) => t.text.length > 0 && !/^\d+(?:%|rb|jt)?$/i.test(t.text));
            if (rechartsTicks.length === 6) xTicks = rechartsTicks;
          }
          xTicks.sort((a, b) => a.x - b.x);

          if (xTicks.length === 6) {
            const minXTickY = Math.min(...xTicks.map((t) => t.y));
            const step = xTicks.length > 1 ? Math.abs(xTicks[1].x - xTicks[0].x) : 60;
            const valueCandidates = allSvgTexts.filter(
              (t) =>
                t.y < minXTickY - 4 &&
                !xTicks.includes(t) &&
                t.x >= xTicks[0].x - step * 0.6
            );
            const matched = xTicks.map((tick, idx) => {
              let bestValTxt = '0';
              let bestDist = step * 0.6;
              for (const vt of valueCandidates) {
                const dist = Math.abs(vt.x - tick.x);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestValTxt = vt.text;
                }
              }
              return {
                shortLabel: compactChartDateLabel(tick.text, idx === 5),
                value: parseDisplayNumeric(bestValTxt),
                valueText: bestValTxt,
              };
            });
            const hasPct = matched.some((m) => m.valueText.includes('%'));
            const hasRp = matched.some((m) => /rp|jt|rb/i.test(m.valueText));
            scaleMode = hasPct ? 'percent' : hasRp ? 'rupiah' : 'count';
            validWeekly = matched;
          }
        }

        if (validWeekly && validWeekly.length === 6) {
          const vizTarget = svg
            ? svg.closest('.recharts-responsive-container') || svg.parentElement || svg
            : Array.from(card.querySelectorAll<HTMLElement>('div')).find(
                (el) => el.children.length === 6
              ) || null;
          if (vizTarget && vizTarget.parentElement) {
            hideVizTarget(vizTarget);
            const chartEl = buildSixWeekBarEl(
              validWeekly.map((w) => ({ ...w, color: '#059669' })),
              scaleMode
            );
            vizTarget.parentElement.insertBefore(chartEl, vizTarget);
            card.setAttribute('data-siap-std-6w', 'true');
            return;
          }
        }
      }

      // 2. STANDARISASI GRAFIK PERBANDINGAN 2 BATANG (Periode Ini vs Periode Lalu)
      if (isPairedCard) {
        let validPaired: Array<{
          label: string;
          cur: number;
          prev: number;
          curText: string;
          prevText: string;
          curColor?: string;
          prevColor?: string;
        }> | null = null;
        let scaleMode: ChartScaleMode = 'count';

        if (validChartData) {
          if (divHint === 'aktivitas' || /aktivitas\s+divisi/i.test(fullTxt)) {
            validPaired = validChartData.aktivitasDivisi.map((item) => ({
              label: item.label,
              cur: item.cur,
              prev: item.prev,
              curText: String(item.cur),
              prevText: String(item.prev),
            }));
            scaleMode = 'count';
          } else if (
            divHint === 'dapur' ||
            /kedisiplinan\s+operasional\s+dapur|masak\s+tepat\s+waktu|petugas\s+dapur/i.test(
              fullTxt
            )
          ) {
            validPaired = validChartData.dapurKedisiplinan.map((item) => ({
              label: item.label,
              cur: item.cur,
              prev: item.prev,
              curText: `${item.cur}%`,
              prevText: `${item.prev}%`,
            }));
            scaleMode = 'percent';
          } else if (
            divHint === 'keuangan' ||
            /perbandingan\s+keuangan|tunai\s*(?:&|dan)\s*transfer/i.test(fullTxt)
          ) {
            const hasAnyFin = validChartData.keuanganMetode.some(
              (m) => m.cur > 0 || m.prev > 0
            );
            if (hasAnyFin) {
              validPaired = validChartData.keuanganMetode.map((item) => ({
                label: item.label,
                cur: item.cur,
                prev: item.prev,
                curText: formatCompactRupiah(item.cur),
                prevText: formatCompactRupiah(item.prev),
              }));
              scaleMode = 'rupiah';
            }
          }
        }

        // Parse SVG jika belum terpenuhi oleh validChartData (mis. Keuangan Tunai/Transfer dari pembayaran_santri_detail)
        if (!validPaired && svg) {
          const allSvgTexts = Array.from(svg.querySelectorAll<SVGTextElement>('text'))
            .map((t) => getSvgTextPos(t, svg))
            .filter((t) => t.text.length > 0);
          const maxY = allSvgTexts.length > 0 ? Math.max(...allSvgTexts.map((t) => t.y)) : 0;

          const bottomRaw = allSvgTexts
            .filter(
              (t) =>
                t.y >= maxY - 26 &&
                !/^periode\s+(?:ini|lalu)$/i.test(t.text) &&
                !/^\d+(?:%|rb|jt)?$/i.test(t.text)
            )
            .sort((a, b) => a.x - b.x || a.y - b.y);

          const groupedCatLabels: Array<{ x: number; y: number; text: string }> = [];
          for (const item of bottomRaw) {
            const existing = groupedCatLabels.find((g) => Math.abs(g.x - item.x) < 14);
            if (existing) {
              existing.text = `${existing.text} ${item.text}`.replace(/\s+/g, ' ').trim();
              existing.y = Math.min(existing.y, item.y);
            } else {
              groupedCatLabels.push({ x: item.x, y: item.y, text: item.text });
            }
          }

          if (groupedCatLabels.length >= 2 && groupedCatLabels.length <= 8) {
            const minCatY = Math.min(...groupedCatLabels.map((g) => g.y));
            const step =
              groupedCatLabels.length > 1
                ? Math.abs(groupedCatLabels[1].x - groupedCatLabels[0].x)
                : 80;
            const rawShapes = Array.from(
              svg.querySelectorAll('.recharts-bar-rectangle rect, .recharts-bar-rectangle path, rect')
            );
            const barBoxes = rawShapes
              .map((sh) => getSvgRectBox(sh, svg))
              .filter(
                (b): b is NonNullable<typeof b> =>
                  Boolean(b) &&
                  !/#f8fafc|#f1f5f9|#e2e8f0|#cbd5e1|rgb\(248|rgb\(241|rgb\(226/i.test(b!.fill)
              );
            const valueTexts = allSvgTexts.filter(
              (t) =>
                t.y < minCatY - 4 &&
                !/^periode\s+(?:ini|lalu)$/i.test(t.text) &&
                t.x >= groupedCatLabels[0].x - step * 0.55
            );

            const parsedCats = groupedCatLabels
              .filter((cat) => {
                if (divHint === 'dapur' && /\bjamaah\b|\bsholat\b/i.test(cat.text)) return false;
                return true;
              })
              .map((cat) => {
                const nearBars = barBoxes
                  .filter((b) => Math.abs(b.cx - cat.x) <= step * 0.48)
                  .sort((a, b) => a.cx - b.cx);
                const nearVals = valueTexts
                  .filter((v) => Math.abs(v.x - cat.x) <= step * 0.48)
                  .sort((a, b) => a.x - b.x);
                let curText = '0';
                let prevText = '0';
                if (nearVals.length >= 2) {
                  curText = nearVals[0].text;
                  prevText = nearVals[1].text;
                } else if (nearVals.length === 1) {
                  const splitPair = nearVals[0].text.split(/\s+/);
                  if (splitPair.length === 2) {
                    curText = splitPair[0];
                    prevText = splitPair[1];
                  } else {
                    curText = nearVals[0].text;
                  }
                }
                return {
                  label: cat.text,
                  cur: parseDisplayNumeric(curText),
                  prev: parseDisplayNumeric(prevText),
                  curText,
                  prevText,
                  curColor: nearBars[0]?.fill || '#059669',
                  prevColor: nearBars[1]?.fill || '#94a3b8',
                };
              });

            if (parsedCats.length >= 2) {
              const hasPct = parsedCats.some(
                (c) => c.curText.includes('%') || c.prevText.includes('%')
              );
              const hasRp = parsedCats.some(
                (c) => /rp|jt|rb/i.test(c.curText) || /rp|jt|rb/i.test(c.prevText)
              );
              scaleMode = hasPct ? 'percent' : hasRp ? 'rupiah' : 'count';
              validPaired = parsedCats;
            }
          }
        }

        if (validPaired && validPaired.length >= 2) {
          const vizTarget = svg
            ? svg.closest('.recharts-responsive-container') || svg.parentElement || svg
            : Array.from(card.querySelectorAll<HTMLElement>('div')).find((el) => {
                const kids = Array.from(el.children);
                return (
                  kids.length >= 2 &&
                  kids.length <= 6 &&
                  el.querySelectorAll('[style*="height"]').length >= 2
                );
              }) || null;

          if (vizTarget && vizTarget.parentElement) {
            hideVizTarget(vizTarget);
            const hasExternalLegend = Array.from(card.querySelectorAll('span, p, div')).some(
              (el) =>
                !vizTarget.contains(el) &&
                el.children.length === 0 &&
                /^periode\s+(?:ini|lalu)$/i.test((el.textContent || '').trim())
            );
            const pairedEl = buildPairedBarEl(validPaired, scaleMode, !hasExternalLegend);
            vizTarget.parentElement.insertBefore(pairedEl, vizTarget);
            card.setAttribute('data-siap-std-paired', 'true');
            return;
          }
        }
      }
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
            standardizeChartCard(clone, 'keuangan');
            finWrap.appendChild(clone);
          });
          insertAfterHeaderOrSummary(div2El, finWrap);
        }
      } else if (div2El && validChartData) {
        const div2Headings = Array.from(div2El.querySelectorAll('h3, h4, h5, p')).map((el) =>
          (el.textContent || '').trim()
        );
        const hasDiv2MethodChart = div2Headings.some((t) =>
          /perbandingan\s+keuangan|tunai\s*(?:&|dan)\s*transfer/i.test(t)
        );
        const hasDiv2TrendChart = div2Headings.some((t) =>
          /tren\s*6\s*(?:pekan|minggu)/i.test(t)
        );
        if (!hasDiv2MethodChart || !hasDiv2TrendChart) {
          const finWrap = document.createElement('div');
          finWrap.setAttribute('data-siap-chart-clone', 'true');
          finWrap.className = 'my-4 grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 break-inside-avoid';

          if (!hasDiv2MethodChart) {
            const methodCard = document.createElement('div');
            methodCard.setAttribute('data-siap-card-styled', 'true');
            methodCard.setAttribute('data-siap-chart-card', 'true');
            methodCard.setAttribute('data-siap-std-paired', 'true');
            methodCard.className = 'rounded-xl overflow-hidden border border-slate-200 bg-slate-50/50 p-4 space-y-2 break-inside-avoid';
            const hdr = document.createElement('h4');
            hdr.className = 'text-[9.5pt] font-bold text-slate-900 leading-tight';
            hdr.textContent = 'Perbandingan Keuangan (Tunai & Transfer)';
            methodCard.appendChild(hdr);
            methodCard.appendChild(
              buildPairedBarEl(
                validChartData.keuanganMetode.map((item) => ({
                  label: item.label,
                  cur: item.cur,
                  prev: item.prev,
                  curText: formatCompactRupiah(item.cur),
                  prevText: formatCompactRupiah(item.prev),
                })),
                'rupiah',
                true
              )
            );
            finWrap.appendChild(methodCard);
          }

          if (!hasDiv2TrendChart) {
            const trendCard = document.createElement('div');
            trendCard.setAttribute('data-siap-card-styled', 'true');
            trendCard.setAttribute('data-siap-chart-card', 'true');
            trendCard.setAttribute('data-siap-std-6w', 'true');
            trendCard.className = 'rounded-xl overflow-hidden border border-slate-200 bg-slate-50/50 p-4 space-y-2 break-inside-avoid';
            const hdr = document.createElement('h4');
            hdr.className = 'text-[9.5pt] font-bold text-slate-900 leading-tight';
            hdr.textContent = 'Tren 6 Pekan Terakhir — Pemasukan';
            trendCard.appendChild(hdr);
            trendCard.appendChild(
              buildSixWeekBarEl(
                validChartData.weekly.keuanganPemasukan.map((w) => ({ ...w, color: '#059669' })),
                'rupiah'
              )
            );
            finWrap.appendChild(trendCard);
          }

          if (finWrap.children.length > 0) {
            insertAfterHeaderOrSummary(div2El, finWrap);
          }
        }
      }

      // 0b-2. Sembunyikan grafik kedisiplinan campuran di Ringkasan Eksekutif & tampilkan khusus Dapur di Bab VIII
      if (disciplineCards.length > 0) {
        disciplineCards.forEach((c) => c.setAttribute('data-siap-hidden-chart', 'true'));
      }
      if (div8El && validChartData) {
        const dapurWrap = document.createElement('div');
        dapurWrap.setAttribute('data-siap-chart-clone', 'true');
        dapurWrap.className = 'my-4 grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 break-inside-avoid';

        if (disciplineCards.length > 0) {
          disciplineCards.forEach((orig) => {
            const clone = orig.cloneNode(true) as HTMLElement;
            clone.removeAttribute('data-siap-hidden-chart');
            clone.setAttribute('data-siap-card-styled', 'true');
            clone.setAttribute('data-siap-chart-card', 'true');
            clone.classList.add('rounded-xl', 'overflow-hidden', 'border', 'border-slate-200');
            clone.querySelectorAll('h3, h4, h5, p').forEach((hdr) => {
              const ht = (hdr.textContent || '').trim();
              if (/kedisiplinan/i.test(ht) && (/jamaah/i.test(ht) || /persentase/i.test(ht) || /dapur/i.test(ht))) {
                hdr.textContent = 'Perbandingan Kedisiplinan Dapur (%)';
              }
            });
            normalizeSvgForClone(clone);
            standardizeChartCard(clone, 'dapur');
            dapurWrap.appendChild(clone);
          });
        } else {
          const discCard = document.createElement('div');
          discCard.setAttribute('data-siap-card-styled', 'true');
          discCard.setAttribute('data-siap-chart-card', 'true');
          discCard.setAttribute('data-siap-std-paired', 'true');
          discCard.className = 'rounded-xl overflow-hidden border border-slate-200 bg-slate-50/50 p-4 space-y-2 break-inside-avoid';
          const hdr = document.createElement('h4');
          hdr.className = 'text-[9.5pt] font-bold text-slate-900 leading-tight';
          hdr.textContent = 'Perbandingan Kedisiplinan Dapur (%)';
          discCard.appendChild(hdr);
          discCard.appendChild(
            buildPairedBarEl(
              validChartData.dapurKedisiplinan.map((item) => ({
                label: item.label,
                cur: item.cur,
                prev: item.prev,
                curText: `${item.cur}%`,
                prevText: `${item.prev}%`,
              })),
              'percent',
              true
            )
          );
          dapurWrap.appendChild(discCard);
        }

        const alreadyHasDapur6w = Array.from(div8El.querySelectorAll('h3, h4, h5, p')).some((el) =>
          /tren\s+(?:ketepatan\s+masak|6\s*(?:pekan|minggu))/i.test((el.textContent || '').trim())
        );
        if (!alreadyHasDapur6w) {
          const trendCard = document.createElement('div');
          trendCard.setAttribute('data-siap-dapur-trend-inject', 'true');
          trendCard.setAttribute('data-siap-card-styled', 'true');
          trendCard.setAttribute('data-siap-chart-card', 'true');
          trendCard.setAttribute('data-siap-std-6w', 'true');
          trendCard.className = 'rounded-xl overflow-hidden border border-slate-200 bg-slate-50/50 p-4 space-y-2 break-inside-avoid';
          const hdr = document.createElement('h4');
          hdr.className = 'text-[9.5pt] font-bold text-slate-900 leading-tight';
          hdr.textContent = 'Tren Ketepatan Masak Dapur (6 Pekan Terakhir)';
          trendCard.appendChild(hdr);
          trendCard.appendChild(
            buildSixWeekBarEl(
              validChartData.weekly.dapur.map((w) => ({ ...w, color: '#059669' })),
              'percent'
            )
          );
          dapurWrap.appendChild(trendCard);
        }

        if (dapurWrap.children.length > 0) {
          insertAfterHeaderOrSummary(div8El, dapurWrap);
        }
      }

      // Hapus seluruh blok Ringkasan Eksekutif & SEMUA grafik atas sebelum Bab I agar Halaman 2 langsung Bab I
      activityCards.forEach((c) => c.setAttribute('data-siap-hidden-chart', 'true'));
      otherExtraExecCharts.forEach((c) => c.setAttribute('data-siap-hidden-chart', 'true'));

      [...financeCards, ...disciplineCards, ...activityCards, ...otherExtraExecCharts].forEach(
        (hiddenCard) => {
          const p = hiddenCard.parentElement;
          if (!p || p === execSectionEl || p === searchContainer) return;
          const visibleKids = Array.from(p.children).filter(
            (ch) => !ch.hasAttribute('data-siap-hidden-chart')
          );
          if (visibleKids.length === 0) {
            p.setAttribute('data-siap-hidden-chart', 'true');
          }
        }
      );

      if (execSectionEl) {
        execSectionEl.setAttribute('data-siap-hidden-chart', 'true');
      }

      // Sapu bersih blok grafik / ringkasan lain di atas Bab I (kecuali Cover)
      const firstBabEl = outermostDivSections[0] || null;
      Array.from(searchContainer.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        if (child.hasAttribute('data-siap-hidden-chart')) return;
        if (outermostDivSections.includes(child)) return;
        if (approvalEl && (child === approvalEl || child.contains(approvalEl))) return;
        if (
          firstBabEl &&
          !(child.compareDocumentPosition(firstBabEl) & Node.DOCUMENT_POSITION_FOLLOWING)
        ) {
          return;
        }
        const txt = (child.textContent || '').replace(/\s+/g, ' ').trim();
        const isCoverCard =
          Boolean(child.querySelector('[data-siap-cakupan-clone="true"]')) ||
          /cakupan\s+data\s+laporan|laporan\s+pertanggungjawaban/i.test(txt);
        if (isCoverCard) return;
        if (
          /Ringkasan\s+Eksekutif|Perbandingan\s+(?:Aktivitas|Keuangan|Persentase\s+Kedisiplinan)|Tren\s+6\s*(?:Bulan|Pekan)/i.test(
            txt
          ) ||
          hasChartVisual(child)
        ) {
          child.setAttribute('data-siap-hidden-chart', 'true');
        }
      });
    }

    // Standarisasi seluruh grafik tren 6 pekan & grafik berpasangan di dalam seluruh Bab (II, IV, V, VI, VII, VIII, X, dll)
    outermostDivSections.forEach((divEl) => {
      const innerCharts = Array.from(divEl.querySelectorAll<HTMLElement>('div, section')).filter(
        (el) => {
          if (el === divEl) return false;
          if (el.hasAttribute('data-siap-hidden-chart')) return false;
          if (el.hasAttribute('data-siap-std-6w') || el.hasAttribute('data-siap-std-paired')) {
            return false;
          }
          const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (!txt || txt.length > 4500) return false;
          const cls = typeof el.className === 'string' ? el.className : '';
          if (!/\bborder\b|\brounded|\bbg-/.test(cls)) return false;
          return hasChartVisual(el);
        }
      );
      const leafChartCards = innerCharts.filter(
        (cand) => !innerCharts.some((other) => other !== cand && cand.contains(other))
      );
      leafChartCards.forEach((card) => {
        card.setAttribute('data-siap-chart-card', 'true');
        standardizeChartCard(card);
      });
    });

    // Pastikan grafik lain yang ditandai ikut distandarisasi
    searchContainer
      .querySelectorAll<HTMLElement>('[data-siap-chart-card="true"]')
      .forEach((card) => {
        if (!card.hasAttribute('data-siap-hidden-chart')) {
          standardizeChartCard(card);
        }
      });

    // 0c. Seragamkan seluruh 4 kartu ringkasan KPI atas di Ringkasan Eksekutif dan Bab I..X
    const normalizeKpiGridsInSection = (sectionEl: HTMLElement | null) => {
      if (!sectionEl) return;
      const grids = Array.from(sectionEl.querySelectorAll<HTMLElement>('div')).filter((el) => {
        if (el === sectionEl) return false;
        if (el.closest('[data-siap-hidden-chart="true"]')) return false;
        if (el.closest('[data-siap-hidden-personalia="true"]')) return false;
        if (el.closest('[data-siap-kamar-grid="true"]')) return false;
        if (el.closest('[data-siap-personalia-clone="true"]')) return false;
        if (el.closest('[data-siap-chart-card="true"]')) return false;
        if (el.closest('[data-siap-approval="true"]')) return false;
        if (el.closest('[data-siap-cakupan-clone="true"]')) return false;
        if (el.querySelector('table') || hasChartVisual(el)) return false;
        const kids = Array.from(el.children) as HTMLElement[];
        if (kids.length !== 4) return false;
        const cls = typeof el.className === 'string' ? el.className : '';
        if (!/\bgrid\b/.test(cls)) return false;
        return kids.every((k) => {
          const kc = typeof k.className === 'string' ? k.className : '';
          return /\bborder\b/.test(kc) || /\bbg-/.test(kc);
        });
      });

      const outermostGrids = grids.filter(
        (cand) => !grids.some((other) => other !== cand && cand.contains(other))
      );

      outermostGrids.forEach((gridEl) => {
        gridEl.setAttribute('data-siap-kpi-grid', 'true');
        gridEl.classList.remove(
          'grid-cols-1',
          'grid-cols-2',
          'sm:grid-cols-2',
          'sm:grid-cols-4',
          'md:grid-cols-2',
          'md:grid-cols-4',
          'gap-2',
          'gap-3',
          'gap-4'
        );
        gridEl.classList.add('grid', 'grid-cols-4', 'gap-2.5', 'items-stretch');
        Array.from(gridEl.children).forEach((kid) => {
          if (!(kid instanceof HTMLElement)) return;
          kid.setAttribute('data-siap-kpi-card', 'true');
          kid.classList.remove('p-2', 'p-4', 'px-2.5', 'py-2', 'px-3', 'py-2.5');
          kid.classList.add(
            'flex',
            'flex-col',
            'justify-between',
            'min-h-[82px]',
            'p-3',
            'rounded-xl',
            'overflow-hidden',
            'h-full'
          );
        });
      });
    };
    normalizeKpiGridsInSection(execSectionEl);
    outermostDivSections.forEach((divEl) => normalizeKpiGridsInSection(divEl));

    // 1. Ganti blok Struktur Personalia (Divisi Administrasi) dengan susunan baku & sapu bersih struktur lama ganda
    const administrasiVisible =
      !isExtraKey(scope) &&
      (scope === 'gabungan'
        ? baseSelectedDivisions.includes('administrasi')
        : scope === 'administrasi');

    if (administrasiVisible) {
      const adminScopeEl = div1ScopeEl || searchContainer;

      // Hitung santri ndalem dari DOM atau extraRaw.santriRows agar Total Penghuni Pondok & Total Keseluruhan sinkron (134 + 0 + 18 = 152)
      let detectedNdalemCount = 0;
      const ndalemCard = Array.from((adminScopeEl || searchContainer).querySelectorAll<HTMLElement>('div')).find(
        (d) => {
          if (d.closest('[data-siap-personalia-clone="true"]')) return false;
          const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
          return /^Santri\s+Ndalem\b/i.test(t) && t.length < 120;
        }
      );
      if (ndalemCard) {
        const m = (ndalemCard.textContent || '').match(/\b(\d+)\b/);
        if (m) detectedNdalemCount = Number(m[1]) || 0;
      }

      // 1a. Sinkronkan angka kartu Pengurus Aktif (18 orang) & Total Penghuni Pondok / Total Keseluruhan (152 orang)
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

        const syncTotalPenghuniCard = (rootEl: HTMLElement | null) => {
          if (!rootEl) return;
          const cards = Array.from(rootEl.querySelectorAll<HTMLElement>('div')).filter((d) => {
            if (d.closest('[data-siap-personalia-clone="true"]')) return false;
            const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
            return /Total\s+(?:Penghuni\s+Pondok|Keseluruhan)/i.test(t) && t.length < 240;
          });
          const innerCards = cards.filter(
            (cand) => !cards.some((other) => other !== cand && cand.contains(other))
          );
          innerCards.forEach((card) => {
            const fullCardText = (card.textContent || '').replace(/\s+/g, ' ').trim();
            const ndalemMatch = fullCardText.match(/(\d+)\s*ndalem/i);
            const ndalemCount = ndalemMatch ? Number(ndalemMatch[1]) : detectedNdalemCount;
            const santriCount = bundle?.administrasi?.totalSantriAktif ?? 0;
            const totalPenghuni = santriCount + ndalemCount + pengurusAktifCount;

            const leafNodes = Array.from(
              card.querySelectorAll<HTMLElement>('strong, b, p, span, div')
            ).filter((n) => n.children.length === 0);
            leafNodes.forEach((n) => {
              const nt = (n.textContent || '').replace(/\s+/g, ' ').trim();
              if (/^\d+(?:\s*Orang)?$/i.test(nt)) {
                if (!n.hasAttribute('data-siap-orig-text')) {
                  n.setAttribute('data-siap-orig-text', n.textContent || '');
                }
                n.textContent = /orang/i.test(nt)
                  ? `${totalPenghuni} ${/Orang/.test(nt) ? 'Orang' : 'orang'}`
                  : String(totalPenghuni);
              } else if (/santri/i.test(nt) && /pengurus/i.test(nt)) {
                if (!n.hasAttribute('data-siap-orig-text')) {
                  n.setAttribute('data-siap-orig-text', n.textContent || '');
                }
                n.textContent = `${santriCount} santri + ${ndalemCount} ndalem + ${pengurusAktifCount} pengurus`;
              } else if (/\d+\s*pengurus/i.test(nt)) {
                if (!n.hasAttribute('data-siap-orig-text')) {
                  n.setAttribute('data-siap-orig-text', n.textContent || '');
                }
                n.textContent = nt.replace(/\d+\s*pengurus/gi, `${pengurusAktifCount} pengurus`);
              }
            });
          });
        };
        syncTotalPenghuniCard(execSectionEl);
        syncTotalPenghuniCard(adminScopeEl);
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

        // Sapu bersih seluruh blok teks/tabel struktur personalia lama berformat titik dua (termasuk I. DEWAN HARIAN, II. PLENO, H. Dewan Pengasuh (Dzurriyah), L. Pengasuh Pondok, M. Sie Koperasi)
        const postScanEls = Array.from(
          adminScopeEl.querySelectorAll('div, section, table, ul, ol, p, h3, h4, h5, h6, li, tr')
        ) as HTMLElement[];
        const duplicateOldBlocks = postScanEls.filter((el) => {
          if (el === adminScopeEl || el === searchContainer) return false;
          if (el.closest('[data-siap-personalia-clone="true"]')) return false;
          if (el.closest('[data-siap-kamar-grid="true"]')) return false;
          if (el.closest('[data-siap-kpi-grid="true"]')) return false;
          if (cloneWrap && (el === cloneWrap || el.contains(cloneWrap))) return false;
          if (el.closest('[data-siap-hidden-personalia="true"]')) return false;
          if (approvalEl && (el === approvalEl || el.contains(approvalEl) || approvalEl.contains(el))) {
            return false;
          }
          const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (txt.length === 0 || txt.length > 25000) return false;
          if (
            /\bDivisi\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)\b|Ringkasan\s+Eksekutif|Daftar\s+Kamar|Santri\s+Aktif|Santri\s+Ndalem|Mutasi\s+Santri|Administrasi\s*&\s*Data\s+Santri/i.test(
              txt
            )
          ) {
            return false;
          }
          return (
            /\bI\.\s*DEWAN\s*HARIAN\b/i.test(txt) ||
            /\bII\.\s*PLENO\b/i.test(txt) ||
            /pengasuh|dzurriyah|direktur\s+pendidikan/i.test(txt) ||
            /\b[A-M]\.\s*(?:Dewan\s+Pengasuh|Pengasuh\s+Pondok|Direktur\s+Pendidikan|Sie\s+Kegiatan|Sie\s+Keamanan|Sie\s+Kesehatan|Sie\s+Kebersihan|Sie\s+Sarpras|Sie\s+Dapur|Sie\s+Koperasi|Sie\s+Koprasi|Sie\s+Laundry|Operator\s+EMIS|Guru\s+Bantu|Musyrif\s+Kamar)\b/i.test(
              txt
            ) ||
            /^\s*(?:\d+\.\s*)?(?:Pengasuh\s+Pondok|Dewan\s+Pengasuh|Direktur\s+Pendidikan|Kepala\s+Pondok|Wakil\s+Kepala\s+Pondok|Sekretaris|Wakil\s+Sekretaris|Bendahara|Wakil\s+Bendahara|Sie\s+(?:Kegiatan|Keamanan|Kesehatan|Kebersihan|Sarpras|Dapur|Koperasi|Koprasi|Laundry)|Operator\s+EMIS|Guru\s+Bantu|Musyrif\s+Kamar)\s*:/i.test(
              txt
            ) ||
            (/Kepala\s+Pondok/i.test(txt) && /Sekretaris/i.test(txt) && /Bendahara/i.test(txt))
          );
        });
        if (!cloneWrap && duplicateOldBlocks.length > 0 && duplicateOldBlocks[0].parentElement) {
          cloneWrap = document.createElement('div');
          cloneWrap.setAttribute('data-siap-personalia-clone', 'true');
          cloneWrap.setAttribute('data-siap-page-start', 'true');
          cloneWrap.className = 'break-before-page print:break-before-page';
          cloneWrap.innerHTML = personaliaSource.innerHTML;
          duplicateOldBlocks[0].parentElement.insertBefore(cloneWrap, duplicateOldBlocks[0]);
        }
        for (const oldBlk of duplicateOldBlocks) {
          if (cloneWrap && (oldBlk === cloneWrap || oldBlk.contains(cloneWrap))) continue;
          oldBlk.setAttribute('data-siap-hidden-personalia', 'true');
        }
      }

      // 1b. Susun daftar 21 kamar ke dalam 2 tabel terpisah yang simetris
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

    // 1c. Bab II (Laporan Keuangan Pesantren): Sinkronkan Tunggakan Syahriyah, hapus duplikat Rekap Tunggakan & Buku Kas Tunai, serta pastikan nominal & tanggal nowrap
    if (div2El) {
      if (extraRaw.santriRows.length > 0) {
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

      // Hapus blok duplikat pada Rekap Kelompok Tunggakan Syahriah dan Buku Kas Tunai di Bab II
      const deduplicateDiv2Subsections = (headingRx: RegExp) => {
        const headingNodes = Array.from(
          div2El.querySelectorAll<HTMLElement>('h3, h4, h5, p, div, span')
        ).filter((el) => {
          if (el.closest('[data-siap-hidden-tunggakan="true"]')) return false;
          if (el.closest('[data-siap-hidden-dup="true"]')) return false;
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (!t || t.length > 140) return false;
          const childMatch = Array.from(el.children).some((ch) =>
            headingRx.test((ch.textContent || '').replace(/\s+/g, ' ').trim())
          );
          return !childMatch && headingRx.test(t);
        });

        const resolvedBlocks: HTMLElement[] = [];
        for (const hEl of headingNodes) {
          let cur: HTMLElement | null = hEl.parentElement;
          let bestBlk: HTMLElement = hEl;
          while (cur && cur !== div2El) {
            const contained = headingNodes.filter((n) => cur!.contains(n));
            if (contained.length > 1) break;
            const t = (cur.textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length > 25000 || /\b(?:Divisi|Bab)\s+II\b/i.test(t.slice(0, 120))) break;
            bestBlk = cur;
            cur = cur.parentElement;
          }
          if (bestBlk !== div2El && !resolvedBlocks.includes(bestBlk)) {
            resolvedBlocks.push(bestBlk);
          }
        }
        const outermostBlocks = resolvedBlocks.filter(
          (cand) => !resolvedBlocks.some((other) => other !== cand && other.contains(cand))
        );
        if (outermostBlocks.length > 1) {
          outermostBlocks.slice(1).forEach((dupBlk) => {
            dupBlk.setAttribute('data-siap-hidden-dup', 'true');
          });
        }
      };

      deduplicateDiv2Subsections(/rekap\s+kelompok\s+tunggakan/i);
      deduplicateDiv2Subsections(/buku\s+kas\s+tunai/i);

      // Pastikan seluruh angka Rupiah dan tanggal di tabel Bab II memakai whitespace-nowrap agar tidak patah baris
      div2El.querySelectorAll<HTMLElement>('table td, table th').forEach((cell) => {
        const txt = (cell.textContent || '').replace(/\s+/g, ' ').trim();
        if (
          /^[-+]?\s*Rp[\s\d.,]+$/i.test(txt) ||
          /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(txt) ||
          /^\d{4}-\d{2}-\d{2}$/.test(txt)
        ) {
          cell.classList.add('whitespace-nowrap', 'tabular-nums');
        }
      });
    }

    // 2. Bab III (Kegiatan Pondok): Ganti daftar kartu kegiatan dengan tabel terstruktur rapi + pastikan Dokumentasi Foto hanya 1 kali
    if (div3El) {
      const fotoTitleEls = Array.from(
        div3El.querySelectorAll<HTMLElement>('h3, h4, h5, p, div, span')
      ).filter((el) => {
        if (el.closest('[data-siap-kegiatan-foto-clone="true"]')) return false;
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!txt || txt.length > 120) return false;
        const hasChildMatch = Array.from(el.children).some((ch) =>
          /lampiran\s+dokumentasi\s+foto|dokumentasi\s+foto\s+kegiatan/i.test(
            (ch.textContent || '').replace(/\s+/g, ' ').trim()
          )
        );
        return (
          !hasChildMatch &&
          /(?:lampiran\s+)?dokumentasi\s+foto(?:\s+kegiatan)?\b/i.test(txt)
        );
      });

      const existingFotoBlocks: HTMLElement[] = [];
      for (const titleEl of fotoTitleEls) {
        let cur: HTMLElement | null = titleEl;
        let bestBlock: HTMLElement = titleEl;
        while (cur && cur !== div3El) {
          const fullTxt = (cur.textContent || '').replace(/\s+/g, ' ').trim();
          const hasMainTable = cur.querySelectorAll('table').length > 0;
          if (
            hasMainTable ||
            /\b(?:Divisi|Bab)\s+III\b|Pengisi\s+Acara|Rekapitulasi\s+Kegiatan|Daftar\s+Agenda/i.test(
              fullTxt
            )
          ) {
            break;
          }
          if (fullTxt.length > 25000) break;
          bestBlock = cur;
          cur = cur.parentElement;
        }
        if (bestBlock !== div3El && !existingFotoBlocks.includes(bestBlock)) {
          existingFotoBlocks.push(bestBlock);
        }
        if (bestBlock.querySelectorAll('img').length === 0) {
          let sib = bestBlock.nextElementSibling as HTMLElement | null;
          while (sib) {
            const sibTxt = (sib.textContent || '').replace(/\s+/g, ' ').trim();
            if (
              sib.querySelector('table') ||
              /\b(?:Divisi|Bab)\s+III\b|Pengisi\s+Acara|Rekapitulasi/i.test(sibTxt)
            ) {
              break;
            }
            if (sib.querySelector('img') || /foto|dokumentasi|notulensi/i.test(sibTxt)) {
              existingFotoBlocks.push(sib);
              sib = sib.nextElementSibling as HTMLElement | null;
            } else {
              break;
            }
          }
        }
      }
      const outermostFotoBlocks = existingFotoBlocks.filter(
        (cand) => !existingFotoBlocks.some((other) => other !== cand && other.contains(cand))
      );

      const pengisiCandidates = Array.from(div3El.querySelectorAll('table, div, section')).filter(
        (el) => {
          if (el === div3El) return false;
          if (el.closest('[data-siap-hidden-kegiatan-foto="true"]')) return false;
          if (el.closest('[data-siap-kpi-grid="true"]')) return false;
          const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
          return (
            /^(?:Rincian|Rekap|Daftar)?\s*Pengisi\s+(?:Kegiatan|Acara)|Rincian\s+Pengisi\s+Kegiatan|Rekap\s+Pengisi/i.test(
              txt
            ) && txt.length < 15000
          );
        }
      );
      const outermostPengisi = pengisiCandidates.filter(
        (cand) => !pengisiCandidates.some((other) => other !== cand && other.contains(cand))
      );

      // Ganti daftar kartu / tabel kegiatan lama dengan Tabel Terstruktur Bab III
      if (kegiatanTableSource) {
        const agendaBlocksToHide: HTMLElement[] = [];
        Array.from(div3El.children).forEach((child) => {
          if (!(child instanceof HTMLElement)) return;
          if (child.hasAttribute('data-siap-kpi-grid')) return;
          if (child.hasAttribute('data-siap-chart-card')) return;
          if (child.hasAttribute('data-siap-kegiatan-foto-clone')) return;
          if (child.hasAttribute('data-siap-hidden-kegiatan-foto')) return;
          if (outermostFotoBlocks.some((f) => child === f || child.contains(f) || f.contains(child))) {
            return;
          }
          if (outermostPengisi.some((p) => child === p || child.contains(p))) return;
          if (child.querySelector('h2, h3') && /Kegiatan\s+Pondok/i.test(child.textContent || '')) {
            return;
          }
          const txt = (child.textContent || '').replace(/\s+/g, ' ').trim();
          const isAgendaList =
            Boolean(child.querySelector('table')) ||
            /Daftar\s+(?:Agenda|Kegiatan)|Jadwal\s+Kegiatan|Rincian\s+Kegiatan|Susunan\s+Pengisi|Lokasi\s*:|Penanggung\s+Jawab\s*:|Belum\s+ada\s+(?:agenda|kegiatan)/i.test(
              txt
            );
          if (isAgendaList) {
            agendaBlocksToHide.push(child);
          }
        });

        const tableClone = document.createElement('div');
        tableClone.setAttribute('data-siap-kegiatan-table-clone', 'true');
        tableClone.className = 'mt-3 space-y-2';
        tableClone.innerHTML = kegiatanTableSource.innerHTML;

        // Fallback DOM: jika ada baris dengan Susunan Pengisi / Petugas masih '-', cek konten asli LaporanDocument di div3El
        const domPengisiByTitle = new Map<string, string[]>();
        const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const trRows = Array.from(tableClone.querySelectorAll('tbody tr'));
        const rowTitles = trRows
          .map((tr) => (tr.children[2]?.querySelector('span')?.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean);

        if (rowTitles.length > 0) {
          const domSearchContainers = [...agendaBlocksToHide, ...outermostPengisi];
          for (const container of domSearchContainers) {
            const cText = (container.textContent || '').replace(/\s+/g, ' ').trim();
            if (!cText) continue;
            // Cek baris tabel asli jika ada
            container.querySelectorAll('tbody tr').forEach((origTr) => {
              const cells = Array.from(origTr.children).map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim());
              if (cells.length < 2) return;
              const matchedTitle = rowTitles.find((t) =>
                cells.some((c) => c.toLowerCase().includes(t.toLowerCase()))
              );
              if (!matchedTitle) return;
              const pengisiCell = cells.find(
                (c) =>
                  c !== '-' &&
                  !c.toLowerCase().includes(matchedTitle.toLowerCase()) &&
                  (/pengisi|petugas|mc|qori|imam|pemateri|moderator|kultum/i.test(c) || /\d+[.)]/.test(c))
              );
              if (pengisiCell) {
                domPengisiByTitle.set(matchedTitle.toLowerCase(), pengisiCell.split(/\s*[;\n]+\s*/).filter(Boolean));
              }
            });
            // Cek kartu agenda asli jika ada label Pengisi: / Petugas:
            const rawContainerText =
              container instanceof HTMLElement && container.innerText ? container.innerText : cText;
            for (const title of rowTitles) {
              if (domPengisiByTitle.has(title.toLowerCase())) continue;
              const rx = new RegExp(
                `${escapeRx(title)}[\\s\\S]{0,400}?(?:Susunan\\s+)?(?:Pengisi|Petugas)\\s*[:\\-]\\s*([^\\n]+)`,
                'i'
              );
              const match = rawContainerText.match(rx);
              if (match && match[1]) {
                const rawVal = match[1]
                  .replace(/\s*(?:Status|Lokasi|Penanggung\s+Jawab|PJ)\s*:.*$/i, '')
                  .trim();
                if (rawVal && rawVal !== '-' && !/^belum\s+ada/i.test(rawVal)) {
                  domPengisiByTitle.set(
                    title.toLowerCase(),
                    rawVal
                      .split(/\s*[;,]\s*|\n+/)
                      .map((x: string) => x.trim())
                      .filter(Boolean)
                  );
                }
              }
            }
          }
        }

        trRows.forEach((tr) => {
          const pengisiTd = tr.children[4] as HTMLElement | undefined;
          const titleText = (tr.children[2]?.querySelector('span')?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          if (!pengisiTd || !titleText) return;
          if ((pengisiTd.textContent || '').trim() === '-') {
            const domItems = domPengisiByTitle.get(titleText);
            if (domItems && domItems.length > 0) {
              pengisiTd.innerHTML = '';
              const listWrap = document.createElement('div');
              listWrap.className = 'space-y-0.5';
              domItems.forEach((entryTxt, eIdx) => {
                const lineDiv = document.createElement('div');
                lineDiv.className = 'text-slate-800 break-words';
                const numSpan = document.createElement('span');
                numSpan.className = 'font-mono text-slate-500 mr-1';
                numSpan.textContent = `${eIdx + 1}.`;
                const txtSpan = document.createElement('span');
                txtSpan.className = 'font-semibold';
                txtSpan.textContent = entryTxt.replace(/^\d+[.)]\s*/, '');
                lineDiv.appendChild(numSpan);
                lineDiv.appendChild(txtSpan);
                listWrap.appendChild(lineDiv);
              });
              pengisiTd.appendChild(listWrap);
            }
          }
        });

        if (agendaBlocksToHide.length > 0) {
          agendaBlocksToHide[0].parentElement?.insertBefore(tableClone, agendaBlocksToHide[0]);
          agendaBlocksToHide.forEach((blk) =>
            blk.setAttribute('data-siap-hidden-kegiatan-list', 'true')
          );
        } else if (outermostPengisi[0] && outermostPengisi[0].parentElement) {
          outermostPengisi[0].parentElement.insertBefore(tableClone, outermostPengisi[0]);
        } else {
          insertAfterHeaderOrSummary(div3El, tableClone);
        }
      }

      if (kegiatanFotoSource && kegiatanLampiranFoto.length > 0) {
        outermostFotoBlocks.forEach((blk) => {
          blk.setAttribute('data-siap-hidden-kegiatan-foto', 'true');
        });

        const fotoClone = document.createElement('div');
        fotoClone.setAttribute('data-siap-kegiatan-foto-clone', 'true');
        fotoClone.className = 'mt-5 pt-4 border-t border-slate-200 space-y-3';
        fotoClone.innerHTML = kegiatanFotoSource.innerHTML;

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

    // 2c. Bab VIII (Dapur Umum & Konsumsi Santri): Pastikan kolom Menu Ringkas tampil sebagai teks biasa & suntikkan 3 Rekap Operasional Dapur
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
                .replace(/\$/g, '')
                .replace(/~/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              if (!cell.hasAttribute('data-siap-orig-text')) {
                cell.setAttribute('data-siap-orig-text', cell.textContent || '');
              }
              cell.textContent = rawMenu || '-';
            } else {
              const rawCellTxt = (cell.textContent || '').trim();
              if (rawCellTxt.includes('$') || rawCellTxt.includes('~')) {
                const cleanedMenu = rawCellTxt
                  .replace(/\$/g, '')
                  .replace(/~/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                if (cleanedMenu !== rawCellTxt) {
                  if (!cell.hasAttribute('data-siap-orig-text')) {
                    cell.setAttribute('data-siap-orig-text', cell.textContent || '');
                  }
                  cell.textContent = cleanedMenu || '-';
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
        if (d8Cur.nodeValue && (/\$/.test(d8Cur.nodeValue) || /~/.test(d8Cur.nodeValue))) {
          d8Nodes.push(d8Cur as Text);
        }
        d8Cur = d8Walker.nextNode();
      }
      d8Nodes.forEach((n) => {
        if (n.nodeValue) {
          n.nodeValue = n.nodeValue.replace(/\$/g, '').replace(/~/g, ' ');
        }
      });

      if (dapurExtraSource) {
        const dapurClone = document.createElement('div');
        dapurClone.setAttribute('data-siap-dapur-extra-clone', 'true');
        dapurClone.className = 'mt-4 space-y-4';
        dapurClone.innerHTML = dapurExtraSource.innerHTML;
        div8El.appendChild(dapurClone);
      }
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

    // 3b. Pastikan seluruh daftar bernomor 2 kolom mengalir ke bawah dulu (Kolom Kiri 1..N/2, Kolom Kanan N/2+1..N)
    Array.from(searchContainer.querySelectorAll<HTMLElement>('div, ul, ol')).forEach((gridEl) => {
      if (gridEl.closest('[data-siap-hidden-dup="true"]')) return;
      if (gridEl.closest('[data-siap-hidden-chart="true"]')) return;
      if (gridEl.closest('[data-siap-hidden-personalia="true"]')) return;
      if (gridEl.closest('[data-siap-hidden-kegiatan-list="true"]')) return;
      if (gridEl.closest('[data-siap-personalia-clone="true"]')) return;
      if (gridEl.closest('[data-siap-reordered-col-clone="true"]')) return;
      if (gridEl.closest('[data-siap-kamar-grid="true"]')) return;
      if (gridEl.closest('[data-siap-kpi-grid="true"]')) return;
      if (gridEl.closest('[data-siap-chart-card="true"]')) return;
      const cls = typeof gridEl.className === 'string' ? gridEl.className : '';
      if (!/\b(?:sm:|md:|print:)?grid-cols-2\b/.test(cls)) return;
      const kids = Array.from(gridEl.children) as HTMLElement[];
      if (kids.length < 3) return;
      const t0 = (kids[0].textContent || '').replace(/\s+/g, ' ').trim();
      const t1 = (kids[1].textContent || '').replace(/\s+/g, ' ').trim();
      const t2 = (kids[2].textContent || '').replace(/\s+/g, ' ').trim();
      if (/^1[.)]\s*/.test(t0) && /^2[.)]\s*/.test(t1) && /^3[.)]\s*/.test(t2)) {
        const mid = Math.ceil(kids.length / 2);
        const reorderedWrap = document.createElement('div');
        reorderedWrap.setAttribute('data-siap-reordered-col-clone', 'true');
        reorderedWrap.className = 'grid grid-cols-2 gap-x-4 gap-y-1 items-start';
        const leftCol = document.createElement('div');
        leftCol.className = 'space-y-1 min-w-0';
        const rightCol = document.createElement('div');
        rightCol.className = 'space-y-1 min-w-0';
        kids.slice(0, mid).forEach((k) => leftCol.appendChild(k.cloneNode(true)));
        kids.slice(mid).forEach((k) => rightCol.appendChild(k.cloneNode(true)));
        reorderedWrap.appendChild(leftCol);
        reorderedWrap.appendChild(rightCol);
        gridEl.setAttribute('data-siap-hidden-dup', 'true');
        gridEl.parentElement?.insertBefore(reorderedWrap, gridEl);
      }
    });

    // 3c. Urutkan SELURUH tabel kronologis di semua Bab (Bab I..XIII) dari tanggal paling awal ke paling akhir (Ascending)
    const activeStartYear = Number((activeRange.start || '').slice(0, 4)) || new Date().getFullYear();
    const activeEndYear = Number((activeRange.end || '').slice(0, 4)) || activeStartYear;

    const parseTableDateMs = (rawText: string): number => {
      const cleaned = (rawText || '').replace(/\s+/g, ' ').trim();
      if (!cleaned || cleaned === '-') return Number.NaN;

      const isoMatch = cleaned.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
      if (isoMatch) {
        return Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
      }

      const dmyFullMatch = cleaned.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
      if (dmyFullMatch) {
        const d = Number(dmyFullMatch[1]);
        const m = Number(dmyFullMatch[2]);
        let y = Number(dmyFullMatch[3]);
        if (y < 100) y += 2000;
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return Date.UTC(y, m - 1, d);
        }
      }

      const monthTextMatch = cleaned
        .toLowerCase()
        .match(
          /\b(\d{1,2})\s+(jan|januari|feb|februari|mar|maret|apr|april|mei|may|jun|juni|jul|juli|agu|ags|agustus|aug|sep|sept|september|okt|oktober|oct|nov|november|des|desember|dec)(?:\s+(20\d{2}))?\b/
        );
      if (monthTextMatch) {
        const extraMap: Record<string, string> = {
          ...SHORT_ID_MONTH_MAP,
          may: '05',
          aug: '08',
          oct: '10',
          dec: '12',
        };
        const d = Number(monthTextMatch[1]);
        const m = Number(extraMap[monthTextMatch[2]] || '0');
        let y = monthTextMatch[3] ? Number(monthTextMatch[3]) : activeEndYear;
        if (!monthTextMatch[3] && activeStartYear !== activeEndYear) {
          y = m >= 11 ? activeStartYear : activeEndYear;
        }
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return Date.UTC(y, m - 1, d);
        }
      }

      const dmShortMatch = cleaned.match(/\b(\d{1,2})[\/-](\d{1,2})\b/);
      if (dmShortMatch) {
        const d = Number(dmShortMatch[1]);
        const m = Number(dmShortMatch[2]);
        let y = activeEndYear;
        if (activeStartYear !== activeEndYear) {
          y = m >= 11 ? activeStartYear : activeEndYear;
        }
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return Date.UTC(y, m - 1, d);
        }
      }

      return Number.NaN;
    };

    const parseShiftRank = (txt: string): number => {
      const lower = (txt || '').toLowerCase();
      if (/\bpagi\b|\bsubuh\b/.test(lower)) return 1;
      if (/\bsiang\b|\bdzuhur\b/.test(lower)) return 2;
      if (/\bsore\b|\bashar\b/.test(lower)) return 3;
      if (/\bmalam\b|\bmaghrib\b|\bisya\b/.test(lower)) return 4;
      return 9;
    };

    const parseTimeMinutes = (txt: string): number => {
      const m = (txt || '').match(/\b(\d{1,2})[:.](\d{2})\b/);
      if (!m) return 9999;
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh * 60 + mm;
      return 9999;
    };

    const parseSignedNominal = (txt: string): number | null => {
      const cleaned = (txt || '').replace(/\s+/g, ' ').trim();
      if (!cleaned || cleaned === '-') return null;
      const isNeg = cleaned.startsWith('-');
      const digits = cleaned.replace(/[^\d]/g, '');
      if (!digits) return null;
      const val = Number(digits);
      if (!Number.isFinite(val)) return null;
      return isNeg ? -val : val;
    };

    searchContainer.querySelectorAll<HTMLTableElement>('table').forEach((tbl) => {
      if (tbl.closest('[data-siap-hidden-personalia="true"]')) return;
      if (tbl.closest('[data-siap-hidden-approval="true"]')) return;
      if (tbl.closest('[data-siap-hidden-kamar="true"]')) return;
      if (tbl.closest('[data-siap-hidden-perizinan="true"]')) return;
      if (tbl.closest('[data-siap-hidden-tunggakan="true"]')) return;
      if (tbl.closest('[data-siap-hidden-kegiatan-list="true"]')) return;
      if (tbl.closest('[data-siap-hidden-kegiatan-foto="true"]')) return;
      if (tbl.closest('[data-siap-hidden-dup="true"]')) return;
      if (tbl.closest('[data-siap-hidden-chart="true"]')) return;
      if (tbl.closest('[data-siap-personalia-clone="true"]')) return;
      if (tbl.closest('[data-siap-kamar-grid="true"]')) return;
      if (tbl.closest('[data-siap-approval="true"]')) return;
      if (tbl.hasAttribute('data-siap-tunggakan-table')) return;
      if (tbl.hasAttribute('data-siap-izin-table')) return;
      if (tbl.closest('[data-siap-kegiatan-table-clone="true"]')) return;
      if (tbl.closest('[data-siap-dapur-extra-clone="true"]')) return;

      const thead = tbl.querySelector('thead');
      const tbody = tbl.querySelector('tbody');
      if (!thead || !tbody) return;

      const headers = Array.from(thead.querySelectorAll('th, td')).map((h) =>
        (h.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
      );
      if (headers.some((h) => h.includes('bulan menunggak') || h.includes('musyrif') || h.includes('jabatan'))) {
        return;
      }

      let dateColIdx = headers.findIndex(
        (h) =>
          /^(?:tgl|tanggal)$/.test(h) ||
          /^(?:tgl|tanggal)\s+(?:kejadian|periksa|sakit|masak|pulang|keluar|lapor|setor|transaksi|daftar|kegiatan|mulai|pelanggaran|nota|mutasi)\b/.test(
            h
          )
      );
      if (dateColIdx === -1) {
        dateColIdx = headers.findIndex(
          (h) =>
            (h.includes('tanggal') || /\btgl\b/.test(h) || h.includes('hari / tgl') || h.includes('waktu')) &&
            !/rencana|batas|estimasi|tgl\s*masuk|tanggal\s*masuk/.test(h)
        );
      }
      if (dateColIdx === -1) return;

      const shiftColIdx = headers.findIndex((h) => /\b(?:shift|sesi|waktu\s*masak)\b/.test(h));
      const noColIdx = headers.findIndex((h) => /^no\.?$/.test(h));
      const saldoColIdx = headers.findIndex((h) => /^saldo\b/.test(h));
      const masukColIdx = headers.findIndex((h) => /\bmasuk\b|\bdebet\b|\bdebit\b/.test(h));
      const keluarColIdx = headers.findIndex((h) => /\bkeluar\b|\bkredit\b/.test(h));
      const nominalColIdx = headers.findIndex((h) => /\bnominal\b|\bjumlah\b/.test(h));
      const jenisColIdx = headers.findIndex((h) => /\bjenis\b|\bkategori\b|\barah\b/.test(h));

      const rawChildren = Array.from(tbody.children) as HTMLTableRowElement[];
      if (rawChildren.length < 2) return;

      const summaryRows: HTMLTableRowElement[] = [];
      const dataItems: Array<{
        tr: HTMLTableRowElement;
        cells: HTMLElement[];
        dateMs: number;
        shiftRank: number;
        timeMinutes: number;
        origIdx: number;
        saldoVal: number | null;
        deltaVal: number | null;
      }> = [];

      rawChildren.forEach((tr, origIdx) => {
        const cells = Array.from(tr.children) as HTMLElement[];
        const hasColspan = cells.some((c) => ((c as HTMLTableCellElement).colSpan || 1) > 1);
        const firstTxt = (cells[0]?.textContent || '').replace(/\s+/g, ' ').trim();
        const fullRowTxt = (tr.textContent || '').replace(/\s+/g, ' ').trim();
        if (
          hasColspan ||
          /^(?:total|jumlah|grand\s+total|saldo\s+akhir|rata-rata|belum\s+ada|tidak\s+ada)\b/i.test(
            firstTxt
          ) ||
          /^(?:total\s+keseluruhan|grand\s+total)\b/i.test(fullRowTxt)
        ) {
          summaryRows.push(tr);
          return;
        }

        const dateCellTxt = (cells[dateColIdx]?.textContent || '').replace(/\s+/g, ' ').trim();
        const shiftCellTxt = shiftColIdx >= 0 ? (cells[shiftColIdx]?.textContent || '') : '';
        const dateMs = parseTableDateMs(dateCellTxt);
        const shiftRank = parseShiftRank(`${shiftCellTxt} ${fullRowTxt}`);
        const timeMinutes = parseTimeMinutes(`${dateCellTxt} ${shiftCellTxt}`);

        let deltaVal: number | null = null;
        if (saldoColIdx >= 0) {
          if (masukColIdx >= 0 && keluarColIdx >= 0) {
            const mVal = parseSignedNominal(cells[masukColIdx]?.textContent || '') ?? 0;
            const kVal = parseSignedNominal(cells[keluarColIdx]?.textContent || '') ?? 0;
            deltaVal = Math.abs(mVal) - Math.abs(kVal);
          } else if (nominalColIdx >= 0) {
            const rawNom = (cells[nominalColIdx]?.textContent || '').trim();
            const nVal = parseSignedNominal(rawNom);
            if (nVal !== null) {
              const jenisTxt = jenisColIdx >= 0 ? (cells[jenisColIdx]?.textContent || '').toLowerCase() : '';
              const isOut = rawNom.startsWith('-') || /\bkeluar\b|\bbeban\b|\bbelanja\b|\bpengeluaran\b/.test(jenisTxt);
              deltaVal = isOut ? -Math.abs(nVal) : Math.abs(nVal);
            }
          }
        }
        const saldoVal =
          saldoColIdx >= 0 ? parseSignedNominal(cells[saldoColIdx]?.textContent || '') : null;

        dataItems.push({
          tr,
          cells,
          dateMs,
          shiftRank,
          timeMinutes,
          origIdx,
          saldoVal,
          deltaVal,
        });
      });

      const validDates = dataItems.filter((it) => !Number.isNaN(it.dateMs));
      if (dataItems.length < 2 || validDates.length < 2) return;

      const wasDescending = validDates[0].dateMs > validDates[validDates.length - 1].dateMs;

      const tbStore = tbody as unknown as { __siapOrigRows?: Element[] };
      if (!tbStore.__siapOrigRows) {
        tbStore.__siapOrigRows = [...rawChildren];
      }

      const sorted = [...dataItems].sort((a, b) => {
        const aValid = !Number.isNaN(a.dateMs);
        const bValid = !Number.isNaN(b.dateMs);
        if (aValid && bValid && a.dateMs !== b.dateMs) {
          return a.dateMs - b.dateMs;
        }
        if (aValid !== bValid) return aValid ? -1 : 1;
        if (a.shiftRank !== b.shiftRank) return a.shiftRank - b.shiftRank;
        if (a.timeMinutes !== b.timeMinutes) return a.timeMinutes - b.timeMinutes;
        return wasDescending ? b.origIdx - a.origIdx : a.origIdx - b.origIdx;
      });

      // Verifikasi kolom Saldo berjalan (jika ada) agar tetap akurat setelah urut ascending
      if (saldoColIdx >= 0 && sorted.every((it) => it.saldoVal !== null && it.deltaVal !== null)) {
        const isAscendingSaldoConsistent = sorted.every(
          (it, idx) =>
            idx === 0 ||
            Math.abs((it.saldoVal as number) - ((sorted[idx - 1].saldoVal as number) + (it.deltaVal as number))) <= 1
        );
        const wasTopToBottomOnOrig = dataItems.every(
          (it, idx) =>
            idx === 0 ||
            Math.abs((it.saldoVal as number) - ((dataItems[idx - 1].saldoVal as number) + (it.deltaVal as number))) <= 1
        );
        if (!isAscendingSaldoConsistent && wasTopToBottomOnOrig && wasDescending) {
          let running = (dataItems[0].saldoVal as number) - (dataItems[0].deltaVal as number);
          sorted.forEach((it) => {
            running += it.deltaVal as number;
            const saldoCell = it.cells[saldoColIdx];
            if (saldoCell) {
              if (!saldoCell.hasAttribute('data-siap-orig-text')) {
                saldoCell.setAttribute('data-siap-orig-text', saldoCell.textContent || '');
              }
              saldoCell.textContent = formatRupiah(running);
            }
          });
        }
      }

      sorted.forEach((it, idx) => {
        if (noColIdx >= 0 && it.cells[noColIdx]) {
          const noCell = it.cells[noColIdx];
          if (!noCell.hasAttribute('data-siap-orig-text')) {
            noCell.setAttribute('data-siap-orig-text', noCell.textContent || '');
          }
          noCell.textContent = String(idx + 1);
        }
        tbody.appendChild(it.tr);
      });
      summaryRows.forEach((sr) => tbody.appendChild(sr));
      tbl.setAttribute('data-siap-sorted-asc', 'true');
    });

    // 4. Seragamkan sudut agak lengkung (rounded-xl overflow-hidden border) pada seluruh kartu & tabel laporan
    searchContainer.querySelectorAll<HTMLTableElement>('table').forEach((tbl) => {
      if (tbl.closest('[data-siap-hidden-personalia="true"]')) return;
      if (tbl.closest('[data-siap-hidden-approval="true"]')) return;
      if (tbl.closest('[data-siap-hidden-kamar="true"]')) return;
      if (tbl.closest('[data-siap-hidden-tunggakan="true"]')) return;
      if (tbl.closest('[data-siap-hidden-kegiatan-list="true"]')) return;
      if (tbl.closest('[data-siap-hidden-kegiatan-foto="true"]')) return;
      if (tbl.closest('[data-siap-hidden-dup="true"]')) return;
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
      if (el.hasAttribute('data-siap-approval') || el.closest('[data-siap-approval="true"]')) return;
      if (el.closest('[data-siap-hidden-personalia="true"]')) return;
      if (el.closest('[data-siap-hidden-approval="true"]')) return;
      if (el.closest('[data-siap-hidden-kamar="true"]')) return;
      if (el.closest('[data-siap-hidden-tunggakan="true"]')) return;
      if (el.closest('[data-siap-hidden-kegiatan-list="true"]')) return;
      if (el.closest('[data-siap-hidden-kegiatan-foto="true"]')) return;
      if (el.closest('[data-siap-hidden-dup="true"]')) return;
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

    // 5. Pastikan hierarki font A4 rapi (chart labels 8pt, table 8.5pt, narasi 9.5pt, heading 11.5pt)
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
    kegiatanTableRows,
    kegiatanLampiranFoto,
    dapurExtraReports,
    validChartData,
    activeRange.start,
    activeRange.end,
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

    const getPlenoPj = (letter: string, fallback: string) => {
      const sec = strukturPersonalia.plenoSections.find((s) => s.letter === letter);
      const koordinator = sec?.members.find((m) => /koordinator/i.test(m.peran)) || sec?.members[0];
      return koordinator ? `${koordinator.nama} (${sec?.label || fallback})` : fallback;
    };
    const pjKebersihan = getPlenoPj('D', 'Sie Kebersihan');
    const pjKoperasi = getPlenoPj('H', 'Sie Koperasi');
    const pjPsb = pengaturanApproval.nama_sekretaris
      ? `Panitia PSB (${pengaturanApproval.nama_sekretaris})`
      : 'Panitia PSB Pondok';

    return (
      <>
        {(scope === 'kebersihan' ||
          (scope === 'gabungan' && extraSelectedDivisions.includes('kebersihan'))) && (
          <section
            data-siap-page-start={hasBeforeXi ? 'true' : undefined}
            className={`bg-white border border-slate-200 rounded-xl overflow-hidden p-5 sm:p-6 space-y-4 print:border-slate-300 ${
              hasBeforeXi ? 'print:break-before-page' : ''
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
              <div>
                <h3 className="text-[11.5pt] font-bold text-slate-900 leading-tight">
                  XI. Kebersihan &amp; Piket
                </h3>
                <p className="text-[9.5pt] leading-snug text-slate-600 mt-0.5">
                  Penanggung Jawab: <strong className="text-slate-800">{pjKebersihan}</strong>
                </p>
              </div>
              <span className="text-[9.5pt] text-slate-600 font-medium">
                {periodWindow?.label}
              </span>
            </div>

            <div data-siap-kpi-grid="true" className="grid grid-cols-4 gap-2.5 items-stretch text-[9.5pt] leading-snug">
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-slate-600 block text-[8.5pt] leading-tight">Total Jadwal / Tugas</span>
                <div>
                  <strong className="text-[11.5pt] font-bold text-slate-900 tabular-nums block leading-tight">
                    {extraReports.kebersihan.totalTugas}
                  </strong>
                  <span className="text-[8pt] text-slate-500 block leading-tight mt-0.5">
                    Periode lalu: {extraReports.kebersihan.prevTotalTugas}
                  </span>
                </div>
              </div>
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-emerald-50 border border-emerald-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-emerald-800 block text-[8.5pt] leading-tight">Selesai / Bersih</span>
                <strong className="text-[11.5pt] font-bold text-emerald-950 tabular-nums block leading-tight">
                  {extraReports.kebersihan.selesai}
                </strong>
              </div>
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-amber-50 border border-amber-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-amber-800 block text-[8.5pt] leading-tight">Belum / Evaluasi</span>
                <strong className="text-[11.5pt] font-bold text-amber-950 tabular-nums block leading-tight">
                  {extraReports.kebersihan.belum}
                </strong>
              </div>
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-slate-600 block text-[8.5pt] leading-tight">Tingkat Kepatuhan</span>
                <strong className="text-[11.5pt] font-bold text-slate-900 tabular-nums block leading-tight">
                  {extraReports.kebersihan.persenBersih}%
                </strong>
              </div>
            </div>

            {extraReports.kebersihan.detail.length === 0 ? (
              <p className="text-[9.5pt] leading-snug text-slate-600 italic py-2">
                Belum ada catatan piket atau tugas kebersihan tercatat pada periode ini.
              </p>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                <table className="w-full text-[8.5pt] leading-tight border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="px-2 py-1.5 border border-slate-200">Tanggal</th>
                      <th className="px-2 py-1.5 border border-slate-200">Area / Kamar</th>
                      <th className="px-2 py-1.5 border border-slate-200">Tugas / Petugas</th>
                      <th className="px-2 py-1.5 border border-slate-200">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraReports.kebersihan.detail.map((row, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                          {row.tanggal}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 font-semibold text-slate-800">
                          {row.area}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 text-slate-700">{row.tugas}</td>
                        <td className="px-2 py-1.5 border border-slate-200 font-semibold text-slate-800">
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
            className={`bg-white border border-slate-200 rounded-xl overflow-hidden p-5 sm:p-6 space-y-4 print:border-slate-300 ${
              hasBeforeXii ? 'print:break-before-page' : ''
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
              <div>
                <h3 className="text-[11.5pt] font-bold text-slate-900 leading-tight">
                  XII. Koperasi Pondok
                </h3>
                <p className="text-[9.5pt] leading-snug text-slate-600 mt-0.5">
                  Penanggung Jawab: <strong className="text-slate-800">{pjKoperasi}</strong>
                </p>
              </div>
              <span className="text-[9.5pt] text-slate-600 font-medium">
                {periodWindow?.label}
              </span>
            </div>

            <div data-siap-kpi-grid="true" className="grid grid-cols-4 gap-2.5 items-stretch text-[9.5pt] leading-snug">
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-emerald-50 border border-emerald-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-emerald-800 block text-[8.5pt] leading-tight">Pemasukan / Penjualan</span>
                <div>
                  <strong className="text-[11pt] font-bold text-emerald-950 tabular-nums block leading-tight whitespace-nowrap">
                    {formatRupiah(extraReports.koperasi.pemasukan)}
                  </strong>
                  <span className="text-[8pt] text-emerald-700 block leading-tight mt-0.5 whitespace-nowrap">
                    Lalu: {formatRupiah(extraReports.koperasi.prevPemasukan)}
                  </span>
                </div>
              </div>
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-rose-50 border border-rose-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-rose-800 block text-[8.5pt] leading-tight">Pengeluaran / Kulaan</span>
                <strong className="text-[11pt] font-bold text-rose-950 tabular-nums block leading-tight whitespace-nowrap">
                  {formatRupiah(extraReports.koperasi.pengeluaran)}
                </strong>
              </div>
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-slate-600 block text-[8.5pt] leading-tight">Surplus Periode</span>
                <strong className="text-[11pt] font-bold text-slate-900 tabular-nums block leading-tight whitespace-nowrap">
                  {formatRupiah(extraReports.koperasi.surplus)}
                </strong>
              </div>
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-slate-600 block text-[8.5pt] leading-tight">Transaksi &amp; Produk</span>
                <strong className="text-[10.5pt] font-bold text-slate-900 tabular-nums block leading-tight">
                  {extraReports.koperasi.totalTransaksi} Trx · {extraReports.koperasi.totalProduk} Item
                </strong>
              </div>
            </div>

            {/* Grafik Batang Tren Omset Koperasi (6 Pekan Terakhir) */}
            <div
              data-siap-chart-card="true"
              data-siap-std-6w="true"
              className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50/50 p-4 space-y-2.5 break-inside-avoid"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-[9.5pt] font-bold text-slate-900 leading-tight">
                    Tren Omset Koperasi (6 Pekan Terakhir)
                  </h4>
                  <p className="text-[8pt] leading-tight text-slate-600 mt-0.5">
                    Total omset 6 pekan: <strong className="text-slate-900 tabular-nums">{formatRupiah(extraReports.koperasi.totalOmset6Pekan)}</strong>
                  </p>
                </div>
                <span className="text-[8pt] leading-tight font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1 tabular-nums">
                  Rata-rata: {formatCompactRupiah(Math.round(extraReports.koperasi.totalOmset6Pekan / 6))}/pekan
                </span>
              </div>

              <div className="relative pt-2">
                <div className="pointer-events-none absolute inset-x-0 top-7 bottom-5 flex flex-col justify-between z-0">
                  <div className="border-t border-dashed border-slate-200/90 w-full" />
                  <div className="border-t border-dashed border-slate-200/90 w-full" />
                  <div className="border-t border-dashed border-slate-200/90 w-full" />
                </div>
                <div className="relative z-10 grid grid-cols-6 gap-2.5 items-end">
                  {extraReports.koperasi.weeklyOmset.map((wk) => {
                    const pct =
                      wk.omset > 0
                        ? Math.max(8, Math.round((wk.omset / extraReports.koperasi.maxOmset6Pekan) * 100))
                        : 0;
                    return (
                      <div key={wk.label} className="flex flex-col items-center gap-1 min-w-0">
                        <span className="text-[8pt] font-bold text-slate-800 tabular-nums text-center leading-tight whitespace-nowrap">
                          {formatCompactRupiah(wk.omset)}
                        </span>
                        <div className="w-full h-24 border-b border-slate-300 flex items-end justify-center px-1.5">
                          {wk.omset > 0 ? (
                            <div
                              className="w-full max-w-[34px] rounded-t-md bg-emerald-600 transition-all"
                              style={{ height: `${pct}%` }}
                            />
                          ) : (
                            <div className="w-full max-w-[34px] h-[2px] rounded-full bg-slate-300" />
                          )}
                        </div>
                        <span
                          data-siap-xaxis-label="true"
                          className="block text-[8pt] whitespace-nowrap font-semibold text-slate-700 text-center leading-tight"
                        >
                          {wk.shortLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {extraReports.koperasi.detail.length === 0 ? (
              <p className="text-[9.5pt] leading-snug text-slate-600 italic py-2">
                Belum ada transaksi koperasi tercatat pada periode ini.
              </p>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                <table className="w-full text-[8.5pt] leading-tight border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="px-2 py-1.5 border border-slate-200">Tanggal</th>
                      <th className="px-2 py-1.5 border border-slate-200">Keterangan / Barang</th>
                      <th className="px-2 py-1.5 border border-slate-200">Jenis / Metode</th>
                      <th className="px-2 py-1.5 border border-slate-200 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraReports.koperasi.detail.map((row, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                          {row.tanggal}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 font-semibold text-slate-800">
                          {row.keterangan}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 text-slate-700">{row.jenis}</td>
                        <td
                          className={`px-2 py-1.5 border border-slate-200 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
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
            className={`bg-white border border-slate-200 rounded-xl overflow-hidden p-5 sm:p-6 space-y-3 print:border-slate-300 ${
              hasBeforeXiii ? 'print:break-before-page' : ''
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <h3 className="text-[11.5pt] font-bold text-slate-900 leading-tight">
                  XIII. Pendaftaran Santri Baru (PSB)
                </h3>
                <p className="text-[9.5pt] leading-snug text-slate-600 mt-0.5">
                  Penanggung Jawab: <strong className="text-slate-800">{pjPsb}</strong>
                </p>
              </div>
              <span className="text-[9.5pt] text-slate-600 font-medium">
                {periodWindow?.label}
              </span>
            </div>

            <div data-siap-kpi-grid="true" className="grid grid-cols-4 gap-2.5 items-stretch text-[9.5pt] leading-snug">
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-slate-600 block text-[8.5pt] leading-tight">Pendaftar Periode Ini</span>
                <div>
                  <strong className="text-[11.5pt] font-bold text-slate-900 tabular-nums block leading-tight">
                    {extraReports.psb.pendaftarPeriode}
                  </strong>
                  <span className="text-[8pt] text-slate-500 block leading-tight mt-0.5">
                    Total: {extraReports.psb.totalSemua} (Lalu: {extraReports.psb.prevPendaftar})
                  </span>
                </div>
              </div>
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-emerald-50 border border-emerald-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-emerald-800 block text-[8.5pt] leading-tight">Terverifikasi / Diterima</span>
                <strong className="text-[11.5pt] font-bold text-emerald-950 tabular-nums block leading-tight">
                  {extraReports.psb.terverifikasi}
                </strong>
              </div>
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-amber-50 border border-amber-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-amber-800 block text-[8.5pt] leading-tight">Menunggu / Proses</span>
                <strong className="text-[11.5pt] font-bold text-amber-950 tabular-nums block leading-tight">
                  {extraReports.psb.menunggu}
                </strong>
              </div>
              <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex flex-col justify-between min-h-[82px] p-3">
                <span className="text-slate-600 block text-[8.5pt] leading-tight">Pembayaran Masuk PSB</span>
                <strong className="text-[11pt] font-bold text-slate-900 tabular-nums block leading-tight whitespace-nowrap">
                  {formatRupiah(extraReports.psb.totalBayar)}
                </strong>
              </div>
            </div>

            {/* Banner Indikator Sisa Kuota Diskon Pangkal (100 Kuota Pertama) */}
            <div className="rounded-xl overflow-hidden border border-emerald-200 bg-emerald-50/70 px-3 py-2 space-y-1.5 break-inside-avoid">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-[9.5pt] font-bold text-emerald-950 leading-snug">
                    Sisa Kuota Diskon Pangkal (dari {extraReports.psb.kuotaMaks} Kuota Pertama)
                  </h4>
                  <p className="text-[9.5pt] text-emerald-900 leading-snug">
                    Terpakai: <strong className="tabular-nums">{extraReports.psb.kuotaTerpakai}</strong> dari{' '}
                    <strong className="tabular-nums">{extraReports.psb.kuotaMaks}</strong> terverifikasi / aktif ({extraReports.psb.persenKuota}%)
                  </p>
                </div>
                <div className="rounded-xl overflow-hidden border border-emerald-300 bg-white px-3 py-1 text-right">
                  <span className="block text-[8pt] text-emerald-700 font-semibold leading-tight">Sisa Kuota</span>
                  <strong className="text-[11pt] font-bold text-emerald-900 tabular-nums leading-tight">
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
            <div
              data-siap-chart-card="true"
              data-siap-std-6w="true"
              className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50/50 p-4 space-y-2.5 break-inside-avoid"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-[9.5pt] font-bold text-slate-900 leading-tight">
                    Tren Pendaftaran Santri Baru (6 Pekan Terakhir)
                  </h4>
                  <p className="text-[8pt] text-slate-600 leading-tight mt-0.5">
                    Total 6 pekan terakhir:{' '}
                    <strong className="text-slate-900 tabular-nums">
                      {extraReports.psb.weeklyTrend.reduce((acc, w) => acc + w.total, 0)} Santri
                    </strong>
                  </p>
                </div>
                <span className="text-[8pt] leading-tight font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-2.5 py-0.5 tabular-nums">
                  Terverifikasi: {extraReports.psb.weeklyTrend.reduce((acc, w) => acc + w.verif, 0)}
                </span>
              </div>

              <div className="relative pt-2">
                <div className="pointer-events-none absolute inset-x-0 top-7 bottom-5 flex flex-col justify-between z-0">
                  <div className="border-t border-dashed border-slate-200/90 w-full" />
                  <div className="border-t border-dashed border-slate-200/90 w-full" />
                  <div className="border-t border-dashed border-slate-200/90 w-full" />
                </div>
                <div className="relative z-10 grid grid-cols-6 gap-2.5 items-end">
                  {extraReports.psb.weeklyTrend.map((wk) => {
                    const pct =
                      wk.total > 0
                        ? Math.max(8, Math.round((wk.total / extraReports.psb.maxTrend) * 100))
                        : 0;
                    return (
                      <div key={wk.label} className="flex flex-col items-center gap-1 min-w-0">
                        <span className="text-[8pt] font-bold text-slate-800 tabular-nums text-center leading-tight whitespace-nowrap">
                          {wk.total} Org
                        </span>
                        <div className="w-full h-24 border-b border-slate-300 flex items-end justify-center px-1.5">
                          {wk.total > 0 ? (
                            <div
                              className="w-full max-w-[34px] rounded-t-md bg-emerald-600 transition-all"
                              style={{ height: `${pct}%` }}
                            />
                          ) : (
                            <div className="w-full max-w-[34px] h-[2px] rounded-full bg-slate-300" />
                          )}
                        </div>
                        <span
                          data-siap-xaxis-label="true"
                          className="block text-[8pt] whitespace-nowrap font-semibold text-slate-700 text-center leading-tight"
                        >
                          {wk.shortLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {extraReports.psb.detail.length === 0 ? (
              <p className="text-[9.5pt] leading-snug text-slate-600 italic py-2">
                Belum ada pendaftaran santri baru tercatat pada periode ini.
              </p>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                <table className="w-full text-[8.5pt] leading-tight border-collapse" data-siap-compact-table="true">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="px-2 py-1.5 border border-slate-200">Tanggal</th>
                      <th className="px-2 py-1.5 border border-slate-200">No. Reg</th>
                      <th className="px-2 py-1.5 border border-slate-200">Nama Calon Santri</th>
                      <th className="px-2 py-1.5 border border-slate-200">Program / Asal</th>
                      <th className="px-2 py-1.5 border border-slate-200">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraReports.psb.detail.map((row, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                          {row.tanggal}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 font-mono font-semibold text-slate-700 whitespace-nowrap">
                          {row.noReg}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 font-semibold text-slate-900">
                          {row.nama}
                        </td>
                        <td className="px-2 py-1.5 border border-slate-200 text-slate-700">
                          {row.program}
                        </td>
                        <td
                          className={`px-2 py-1.5 border border-slate-200 font-semibold whitespace-nowrap ${
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
        [data-siap-hidden-cakupan="true"],
        [data-siap-hidden-cover-author="true"],
        [data-siap-hidden-approval="true"],
        [data-siap-hidden-kamar="true"],
        [data-siap-hidden-perizinan="true"],
        [data-siap-hidden-tunggakan="true"],
        [data-siap-hidden-kegiatan-list="true"],
        [data-siap-hidden-kegiatan-foto="true"],
        [data-siap-hidden-dup="true"],
        [data-siap-hidden-chart="true"] {
          display: none !important;
        }
        #pusat-laporan-dokumen [data-siap-cover-date-right="true"],
        [data-siap-laporan-doc="true"] [data-siap-cover-date-right="true"] {
          margin-left: auto !important;
          text-align: right !important;
          justify-content: flex-end !important;
          grid-column: 1 / -1 !important;
        }
        [data-siap-hidden-signature="true"] {
          visibility: hidden !important;
          opacity: 0 !important;
        }
        [data-siap-full-span="true"] {
          grid-column: 1 / -1 !important;
          width: 100% !important;
        }
        #pusat-laporan-dokumen [data-siap-kpi-grid="true"],
        [data-siap-laporan-doc="true"] [data-siap-kpi-grid="true"] {
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 0.625rem !important;
          align-items: stretch !important;
        }
        #pusat-laporan-dokumen [data-siap-kpi-card="true"],
        [data-siap-laporan-doc="true"] [data-siap-kpi-card="true"] {
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          min-height: 82px !important;
          padding: 0.75rem !important;
          height: 100% !important;
        }
        #pusat-laporan-dokumen,
        [data-siap-laporan-doc="true"] {
          font-size: 9.5pt !important;
          line-height: 1.375 !important;
        }
        #pusat-laporan-dokumen h2,
        #pusat-laporan-dokumen h3,
        [data-siap-laporan-doc="true"] h2,
        [data-siap-laporan-doc="true"] h3 {
          font-size: 11.5pt !important;
          font-weight: 700 !important;
          line-height: 1.3 !important;
        }
        #pusat-laporan-dokumen [data-siap-chart-card="true"] h3,
        #pusat-laporan-dokumen [data-siap-chart-card="true"] h4,
        [data-siap-laporan-doc="true"] [data-siap-chart-card="true"] h3,
        [data-siap-laporan-doc="true"] [data-siap-chart-card="true"] h4 {
          font-size: 9.5pt !important;
          font-weight: 700 !important;
          line-height: 1.3 !important;
        }
        #pusat-laporan-dokumen p,
        #pusat-laporan-dokumen li,
        #pusat-laporan-dokumen blockquote,
        [data-siap-laporan-doc="true"] p,
        [data-siap-laporan-doc="true"] li {
          font-size: 9.5pt !important;
          line-height: 1.375 !important;
        }
        #pusat-laporan-dokumen [data-siap-approval="true"],
        #pusat-laporan-dokumen [data-siap-approval="true"] *,
        [data-siap-laporan-doc="true"] [data-siap-approval="true"],
        [data-siap-laporan-doc="true"] [data-siap-approval="true"] * {
          overflow: visible !important;
        }
        #pusat-laporan-dokumen [data-siap-approval="true"],
        #pusat-laporan-dokumen [data-siap-approval="true"] p,
        #pusat-laporan-dokumen [data-siap-approval="true"] div,
        #pusat-laporan-dokumen [data-siap-approval="true"] span,
        [data-siap-laporan-doc="true"] [data-siap-approval="true"],
        [data-siap-laporan-doc="true"] [data-siap-approval="true"] p,
        [data-siap-laporan-doc="true"] [data-siap-approval="true"] div,
        [data-siap-laporan-doc="true"] [data-siap-approval="true"] span {
          font-size: 9.5pt !important;
          line-height: 1.375 !important;
        }
        #pusat-laporan-dokumen [data-siap-approval="true"] h3,
        [data-siap-laporan-doc="true"] [data-siap-approval="true"] h3 {
          font-size: 11.5pt !important;
          font-weight: 700 !important;
        }
        #pusat-laporan-dokumen [data-siap-personalia-clone="true"] p,
        #pusat-laporan-dokumen [data-siap-personalia-clone="true"] h5 {
          font-size: 9.5pt !important;
          line-height: 1.375 !important;
        }
        #pusat-laporan-dokumen [data-siap-personalia-clone="true"] [data-siap-musyrif-item="true"],
        #pusat-laporan-dokumen [data-siap-personalia-clone="true"] [data-siap-musyrif-item="true"] span {
          font-size: 8.5pt !important;
          line-height: 1.25 !important;
        }
        #pusat-laporan-dokumen [data-siap-personalia-clone="true"] h4 {
          font-size: 11.5pt !important;
          font-weight: 700 !important;
        }
        #pusat-laporan-dokumen table,
        #pusat-laporan-dokumen table th,
        #pusat-laporan-dokumen table td,
        [data-siap-laporan-doc="true"] table,
        [data-siap-laporan-doc="true"] table th,
        [data-siap-laporan-doc="true"] table td {
          font-size: 8.5pt !important;
          line-height: 1.25 !important;
        }
        #pusat-laporan-dokumen table th,
        #pusat-laporan-dokumen table td,
        [data-siap-laporan-doc="true"] table th,
        [data-siap-laporan-doc="true"] table td {
          padding: 5px 7px !important;
        }
        #pusat-laporan-dokumen [data-siap-personalia-clone="true"] table,
        #pusat-laporan-dokumen [data-siap-personalia-clone="true"] table th,
        #pusat-laporan-dokumen [data-siap-personalia-clone="true"] table td {
          font-size: 8.5pt !important;
          line-height: 1.25 !important;
          padding: 3px 6px !important;
        }
        #pusat-laporan-dokumen table[data-siap-tunggakan-table="true"],
        #pusat-laporan-dokumen table[data-siap-tunggakan-table="true"] th,
        #pusat-laporan-dokumen table[data-siap-tunggakan-table="true"] td,
        [data-siap-laporan-doc="true"] table[data-siap-tunggakan-table="true"],
        [data-siap-laporan-doc="true"] table[data-siap-tunggakan-table="true"] th,
        [data-siap-laporan-doc="true"] table[data-siap-tunggakan-table="true"] td {
          font-size: 8.5pt !important;
          line-height: 1.25 !important;
          padding: 4px 6px !important;
        }
        #pusat-laporan-dokumen table[data-siap-izin-table="true"],
        [data-siap-laporan-doc="true"] table[data-siap-izin-table="true"] {
          table-layout: fixed !important;
          width: 100% !important;
        }
        #pusat-laporan-dokumen table[data-siap-izin-table="true"] th,
        #pusat-laporan-dokumen table[data-siap-izin-table="true"] td,
        [data-siap-laporan-doc="true"] table[data-siap-izin-table="true"] th,
        [data-siap-laporan-doc="true"] table[data-siap-izin-table="true"] td {
          font-size: 8pt !important;
          line-height: 1.25 !important;
          padding: 4px 5px !important;
          overflow-wrap: break-word;
        }
        #pusat-laporan-dokumen [data-siap-chart-card="true"] p,
        #pusat-laporan-dokumen [data-siap-chart-card="true"] span,
        [data-siap-laporan-doc="true"] [data-siap-chart-card="true"] p,
        [data-siap-laporan-doc="true"] [data-siap-chart-card="true"] span {
          font-size: 8pt !important;
          line-height: 1.25 !important;
        }
        #pusat-laporan-dokumen [data-siap-chart-card="true"] [data-siap-std-paired="true"] span,
        #pusat-laporan-dokumen [data-siap-std-paired="true"] [data-siap-std-chart="true"] span,
        [data-siap-laporan-doc="true"] [data-siap-std-paired="true"] [data-siap-std-chart="true"] span {
          font-size: 8pt !important;
          line-height: 1.25 !important;
        }
        #pusat-laporan-dokumen svg text:not([data-siap-cat-label="true"]),
        #pusat-laporan-dokumen svg tspan:not([data-siap-cat-label="true"]),
        [data-siap-laporan-doc="true"] svg text:not([data-siap-cat-label="true"]),
        [data-siap-laporan-doc="true"] svg tspan:not([data-siap-cat-label="true"]) {
          font-size: 8pt !important;
        }
        [data-siap-xaxis-label="true"],
        #pusat-laporan-dokumen [data-siap-xaxis-label="true"],
        [data-siap-laporan-doc="true"] [data-siap-xaxis-label="true"] {
          font-size: 8pt !important;
          line-height: 1.25 !important;
          white-space: nowrap !important;
        }
        [data-siap-cat-label="true"],
        #pusat-laporan-dokumen [data-siap-cat-label="true"],
        [data-siap-laporan-doc="true"] [data-siap-cat-label="true"] {
          font-size: 8pt !important;
          line-height: 1.25 !important;
          white-space: normal !important;
          overflow-wrap: break-word !important;
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
          [data-siap-exec-section="true"] {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            padding: 12px 14px !important;
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
              className="break-before-page print:break-before-page pt-1 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
                <div>
                  <h4 className="text-[11.5pt] font-bold uppercase tracking-wider text-slate-900">
                    A. Struktur Personalia Pengurus Aktif
                  </h4>
                  <p className="text-[9.5pt] leading-snug text-slate-600">
                    Susunan Dewan Harian &amp; Pleno Divisi (tidak termasuk Pengasuh, Dewan Pengasuh/Dzurriyah, dan Direktur Pendidikan)
                  </p>
                </div>
                <span className="text-[9.5pt] leading-snug font-semibold text-slate-600">
                  Total {strukturPersonalia.totalOperationalAssignments} Penugasan
                </span>
              </div>

              {/* BAGIAN I: DEWAN HARIAN (3 Kolom Berpasangan) */}
              <div className="space-y-1.5">
                <h5 className="text-[9.5pt] font-bold uppercase tracking-wider text-emerald-800">
                  BAGIAN I &bull; DEWAN HARIAN
                </h5>
                <div className="grid grid-cols-3 gap-2.5 text-[9pt] leading-snug items-stretch">
                  {[
                    [strukturPersonalia.dewanHarianSlots[0], strukturPersonalia.dewanHarianSlots[1]],
                    [strukturPersonalia.dewanHarianSlots[2], strukturPersonalia.dewanHarianSlots[3]],
                    [strukturPersonalia.dewanHarianSlots[4], strukturPersonalia.dewanHarianSlots[5]],
                  ].map((pair, colIdx) => (
                    <div
                      key={`dh-col-${colIdx}`}
                      className="border border-slate-200 rounded-xl overflow-hidden bg-white divide-y divide-slate-100 break-inside-avoid flex flex-col"
                    >
                      {pair.map((slot) =>
                        slot ? (
                          <div key={slot.nomor} className="px-3 py-2 flex-1">
                            <span className="text-[8pt] font-bold uppercase tracking-wide text-emerald-800 block">
                              {slot.nomor}. {slot.jabatan}
                            </span>
                            <span className="text-[9pt] font-semibold text-slate-900 block mt-0.5 break-words">
                              {slot.names.length > 0 ? slot.names.join(', ') : '-'}
                            </span>
                          </div>
                        ) : null
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* BAGIAN II: PLENO / DIVISI (A - K) */}
              <div className="space-y-1.5">
                <h5 className="text-[9.5pt] font-bold uppercase tracking-wider text-emerald-800">
                  BAGIAN II &bull; PLENO / DIVISI
                </h5>
                <div className="grid grid-cols-2 gap-2.5 text-[9.5pt] leading-snug">
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
                          isMusyrif ? 'col-span-2' : ''
                        }`}
                      >
                        <div className="bg-slate-100 px-2.5 py-1 border-b border-slate-200 flex items-center justify-between gap-2">
                          <span className="text-[9.5pt] font-bold text-slate-900 leading-snug">
                            {sec.letter}. {sec.label}
                          </span>
                          <span className="text-[8.5pt] font-semibold text-slate-600 tabular-nums leading-tight">
                            {sec.members.length} Org
                          </span>
                        </div>
                        {sec.members.length === 0 ? (
                          <p className="px-2.5 py-1.5 text-[8.5pt] leading-tight italic text-slate-400">
                            Belum ada personel ditugaskan
                          </p>
                        ) : isMusyrif ? (
                          <div className="grid grid-cols-2 gap-2.5 p-2" data-siap-compact-table="true">
                            {halves.map((half, colIdx) => {
                              const offset = colIdx === 0 ? 0 : mid;
                              return (
                                <div
                                  key={`K-col-${colIdx}`}
                                  className="border border-slate-200 rounded-lg overflow-hidden bg-white divide-y divide-slate-100"
                                >
                                  {half.length === 0 ? (
                                    <div className="px-2 py-1 text-[8.5pt] italic text-slate-400">-</div>
                                  ) : (
                                    half.map((m, idx) => (
                                      <div
                                        key={`K-${offset + idx}`}
                                        data-siap-musyrif-item="true"
                                        className="px-2.5 py-1 flex flex-col text-[8.5pt] leading-tight"
                                      >
                                        <span className="font-semibold text-slate-900">
                                          <span className="text-slate-500 font-mono tabular-nums mr-1">
                                            {offset + idx + 1}.
                                          </span>
                                          {m.nama}
                                        </span>
                                        <span className="text-slate-600 pl-3.5">
                                          {m.peran}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <table className="w-full text-[8.5pt] leading-tight border-collapse" data-siap-compact-table="true">
                            <tbody>
                              {sec.members.map((m, idx) => (
                                <tr key={`${sec.letter}-${idx}`} className="border-t first:border-t-0 border-slate-100">
                                  <td className="px-2 py-0.5 w-6 text-slate-500 font-mono tabular-nums align-top">
                                    {idx + 1}.
                                  </td>
                                  <td className="px-2 py-0.5 font-semibold text-slate-900 align-top">
                                    {m.nama}
                                  </td>
                                  <td className="px-2 py-0.5 text-right text-slate-600 whitespace-nowrap align-top">
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

          {/* Sumber tersembunyi Tabel Terstruktur Kegiatan Pondok untuk Bab III */}
          <div ref={kegiatanTableSourceRef} className="hidden" aria-hidden="true">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[10pt] font-bold uppercase tracking-wider text-slate-900">
                  Rekapitulasi Agenda &amp; Susunan Petugas Kegiatan
                </h4>
                <span className="text-[8.5pt] font-semibold text-slate-600 tabular-nums">
                  {kegiatanTableRows.length} Agenda
                </span>
              </div>
              {kegiatanTableRows.length === 0 ? (
                <p className="text-[9.5pt] leading-snug text-slate-600 italic py-2">
                  Belum ada agenda kegiatan pondok tercatat pada periode ini.
                </p>
              ) : (
                <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                  <table className="w-full table-fixed border-collapse text-[8.5pt] leading-tight">
                    <colgroup>
                      <col className="w-[34px]" />
                      <col className="w-[16%]" />
                      <col className="w-[22%]" />
                      <col className="w-[18%]" />
                      <col className="w-[28%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 text-left">
                        <th className="px-2 py-1.5 border border-slate-200 w-8 text-center whitespace-nowrap">
                          No
                        </th>
                        <th className="px-2 py-1.5 border border-slate-200">
                          Tanggal &amp; Waktu
                        </th>
                        <th className="px-2 py-1.5 border border-slate-200">
                          Kegiatan &amp; Kategori
                        </th>
                        <th className="px-2 py-1.5 border border-slate-200">
                          Lokasi &amp; PJ
                        </th>
                        <th className="px-2 py-1.5 border border-slate-200">
                          Susunan Pengisi / Petugas
                        </th>
                        <th className="px-2 py-1.5 border border-slate-200 text-center whitespace-nowrap">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {kegiatanTableRows.map((row, idx) => (
                        <tr key={row.id} className="break-inside-avoid">
                          <td className="px-2 py-1.5 border border-slate-200 text-center font-mono tabular-nums whitespace-nowrap align-top">
                            {idx + 1}
                          </td>
                          <td className="px-2 py-1.5 border border-slate-200 align-top">
                            <span className="font-mono font-semibold text-slate-900 tabular-nums block whitespace-nowrap">
                              {row.tanggalText}
                            </span>
                            <span className="text-[8pt] text-slate-600 block mt-0.5">
                              {row.waktuText}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 border border-slate-200 align-top">
                            <span className="font-semibold text-slate-900 block break-words">
                              {row.judul}
                            </span>
                            <span className="text-[8pt] text-slate-600 block mt-0.5">
                              {row.kategori}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 border border-slate-200 align-top">
                            <span className="font-semibold text-slate-800 block break-words">
                              {row.lokasi}
                            </span>
                            <span className="text-[8pt] text-slate-600 block mt-0.5 break-words">
                              PJ: {row.pj}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 border border-slate-200 align-top">
                            {row.pengisiList.length === 0 ? (
                              <span className="text-slate-400 italic">-</span>
                            ) : (
                              <div className="space-y-0.5">
                                {row.pengisiList.map((pg, pIdx) => (
                                  <div key={`${row.id}-pg-${pIdx}`} className="text-slate-800 break-words">
                                    <span className="font-mono text-slate-500 mr-1">{pIdx + 1}.</span>
                                    <span className="font-semibold">{pg.nama}</span>
                                    {pg.peran ? (
                                      <span className="text-slate-600"> ({pg.peran})</span>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td
                            className={`px-2 py-1.5 border border-slate-200 text-center font-semibold whitespace-nowrap align-top ${
                              row.statusTone === 'emerald'
                                ? 'text-emerald-800'
                                : row.statusTone === 'amber'
                                ? 'text-amber-800'
                                : row.statusTone === 'rose'
                                ? 'text-rose-700'
                                : 'text-slate-700'
                            }`}
                          >
                            {row.statusLabel}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sumber tersembunyi Lampiran Dokumentasi Foto Kegiatan untuk disuntikkan ke Bab III. Kegiatan Pondok */}
          <div ref={kegiatanFotoSourceRef} className="hidden" aria-hidden="true">
            {kegiatanLampiranFoto.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[12pt] font-bold uppercase tracking-wider text-slate-900">
                    Lampiran Dokumentasi Foto Kegiatan
                  </h4>
                  <span className="text-[10pt] leading-relaxed font-semibold text-slate-600 tabular-nums">
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
                          <p className="text-[10pt] leading-relaxed font-bold text-slate-900">{ag.judul}</p>
                          <p className="text-[10pt] leading-relaxed text-slate-600">
                            {ag.tanggal ? formatTanggalSuratIndo(ag.tanggal) : '-'}
                            {ag.jamMulai ? ` · ${ag.jamMulai} WIB` : ''}
                            {ag.lokasi ? ` · ${ag.lokasi}` : ''}
                          </p>
                        </div>
                        <span className="text-[10pt] font-bold px-2.5 py-0.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
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
                        <p className="text-[10pt] leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
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
              <div className="rounded-xl overflow-hidden border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-[10pt] leading-relaxed text-emerald-900 font-medium">
                Seluruh santri aktif sudah melunasi Syahriyah berjalan sesuai tanggal masuk.
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                <table className="w-full text-[8.5pt] leading-tight border-collapse" data-siap-tunggakan-table="true">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="px-2 py-1 border border-slate-200 w-9 text-center">No</th>
                      <th className="px-2 py-1 border border-slate-200">Nama Santri</th>
                      <th className="px-2 py-1 border border-slate-200 whitespace-nowrap">Kamar</th>
                      <th className="px-2 py-1 border border-slate-200 whitespace-nowrap">Tgl Masuk</th>
                      <th className="px-2 py-1 border border-slate-200">Bulan Menunggak</th>
                      <th className="px-2 py-1 border border-slate-200 text-right whitespace-nowrap">
                        Nominal Tunggakan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {syahriyahTunggakan.detail.map((row, idx) => (
                      <tr key={row.id}>
                        <td className="px-2 py-1 border border-slate-200 text-center font-mono tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-2 py-1 border border-slate-200 font-semibold text-slate-900">
                          {row.namaSantri}
                        </td>
                        <td className="px-2 py-1 border border-slate-200 text-slate-700 whitespace-nowrap">
                          {row.kamar}
                        </td>
                        <td className="px-2 py-1 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                          {row.tglMasuk}
                        </td>
                        <td className="px-2 py-1 border border-slate-200 text-slate-700">
                          {row.bulanMenunggak} ({row.jumlahBulan} bln)
                        </td>
                        <td className="px-2 py-1 border border-slate-200 text-right font-mono font-bold tabular-nums text-rose-700 whitespace-nowrap">
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
              <p className="text-[10pt] leading-relaxed text-slate-600 italic py-2">
                Belum ada catatan perizinan pulang santri pada periode ini.
              </p>
            ) : (
              <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                <table className="table-fixed w-full text-[8pt] leading-tight border-collapse" data-siap-izin-table="true">
                  <colgroup>
                    <col className="w-[34px]" />
                    <col className="w-[19%]" />
                    <col className="w-[13%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[19%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="px-1.5 py-1.5 border border-slate-200 text-center whitespace-nowrap">No</th>
                      <th className="px-1.5 py-1.5 border border-slate-200">Nama Santri</th>
                      <th className="px-1.5 py-1.5 border border-slate-200 text-center">Kamar</th>
                      <th className="px-1.5 py-1.5 border border-slate-200 text-center whitespace-nowrap">Tgl Pulang</th>
                      <th className="px-1.5 py-1.5 border border-slate-200 text-center">Rencana Kembali</th>
                      <th className="px-1.5 py-1.5 border border-slate-200 text-center whitespace-nowrap">Tgl Kembali</th>
                      <th className="px-1.5 py-1.5 border border-slate-200">Keperluan</th>
                      <th className="px-1.5 py-1.5 border border-slate-200 whitespace-nowrap">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perizinanReportRows.map((row, idx) => (
                      <tr key={row.id}>
                        <td className="px-1.5 py-1.5 border border-slate-200 text-center font-mono tabular-nums whitespace-nowrap align-top">
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
                          className={`px-1.5 py-1.5 border border-slate-200 font-semibold whitespace-nowrap align-top ${
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

          {/* Sumber tersembunyi 3 Rekap Operasional Dapur (Absensi Petugas, Buku 1 Masak, Buku 2 Jualan Malam) untuk Bab VIII */}
          <div ref={dapurExtraSourceRef} className="hidden" aria-hidden="true">
            <div className="space-y-4 pt-2 border-t border-slate-200">
              {/* 1. Rekap Absensi Petugas Dapur */}
              <div className="space-y-2 break-inside-avoid">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[10pt] font-bold uppercase tracking-wider text-slate-900">
                    1. Rekap Absensi Petugas Dapur
                  </h4>
                  <span className="text-[8.5pt] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-0.5 tabular-nums">
                    Kehadiran Keseluruhan: {dapurExtraReports.absen.persenTotal}%
                  </span>
                </div>
                {dapurExtraReports.absen.rows.length === 0 ? (
                  <p className="text-[9.5pt] leading-snug text-slate-600 italic py-1">
                    Belum ada data petugas atau absensi dapur pada periode ini.
                  </p>
                ) : (
                  <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                    <table className="w-full text-[8.5pt] leading-tight border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 text-left">
                          <th className="px-2 py-1.5 border border-slate-200 w-9 text-center whitespace-nowrap">No</th>
                          <th className="px-2 py-1.5 border border-slate-200">Nama Petugas</th>
                          <th className="px-2 py-1.5 border border-slate-200 text-center whitespace-nowrap">Total Jadwal</th>
                          <th className="px-2 py-1.5 border border-slate-200 text-center whitespace-nowrap">Hadir</th>
                          <th className="px-2 py-1.5 border border-slate-200 text-center whitespace-nowrap">Izin/Telat</th>
                          <th className="px-2 py-1.5 border border-slate-200 text-center whitespace-nowrap">Alpha</th>
                          <th className="px-2 py-1.5 border border-slate-200 text-right whitespace-nowrap">% Kehadiran</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dapurExtraReports.absen.rows.map((r, idx) => (
                          <tr key={`dapur-abs-${idx}`} className="break-inside-avoid">
                            <td className="px-2 py-1.5 border border-slate-200 text-center font-mono tabular-nums whitespace-nowrap">
                              {idx + 1}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 font-semibold text-slate-900">
                              {r.nama}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 text-center font-mono tabular-nums whitespace-nowrap">
                              {r.total}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 text-center font-mono font-semibold text-emerald-800 tabular-nums whitespace-nowrap">
                              {r.hadir}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 text-center font-mono text-amber-800 tabular-nums whitespace-nowrap">
                              {r.izinTelat}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 text-center font-mono text-rose-700 tabular-nums whitespace-nowrap">
                              {r.alpha}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                              {r.persen}%
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-bold text-slate-900">
                          <td colSpan={2} className="px-2 py-1.5 border border-slate-200">
                            Total Keseluruhan
                          </td>
                          <td className="px-2 py-1.5 border border-slate-200 text-center font-mono tabular-nums">
                            {dapurExtraReports.absen.totals.total}
                          </td>
                          <td className="px-2 py-1.5 border border-slate-200 text-center font-mono text-emerald-800 tabular-nums">
                            {dapurExtraReports.absen.totals.hadir}
                          </td>
                          <td className="px-2 py-1.5 border border-slate-200 text-center font-mono text-amber-800 tabular-nums">
                            {dapurExtraReports.absen.totals.izinTelat}
                          </td>
                          <td className="px-2 py-1.5 border border-slate-200 text-center font-mono text-rose-700 tabular-nums">
                            {dapurExtraReports.absen.totals.alpha}
                          </td>
                          <td className="px-2 py-1.5 border border-slate-200 text-right font-mono tabular-nums">
                            {dapurExtraReports.absen.persenTotal}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 2. Buku Kas Harian Belanja Masak Dapur (Buku 1 • Anggaran Pondok) */}
              <div className="space-y-2 break-inside-avoid">
                <h4 className="text-[10pt] font-bold uppercase tracking-wider text-slate-900">
                  2. Buku Kas Harian Belanja Masak Dapur (Buku 1 &bull; Anggaran Pondok)
                </h4>
                <div data-siap-kpi-grid="true" className="grid grid-cols-4 gap-2.5 items-stretch">
                  <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-emerald-50 border border-emerald-200 flex flex-col justify-between min-h-[74px] p-3">
                    <span className="text-emerald-800 block text-[8.5pt] leading-tight">Jatah Harian Masuk</span>
                    <strong className="text-[10.5pt] font-bold text-emerald-950 tabular-nums whitespace-nowrap">
                      {formatRupiah(dapurExtraReports.buku1.jatahMasuk)}
                    </strong>
                  </div>
                  <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-rose-50 border border-rose-200 flex flex-col justify-between min-h-[74px] p-3">
                    <span className="text-rose-800 block text-[8.5pt] leading-tight">Total Belanja Pagi &amp; Sore</span>
                    <strong className="text-[10.5pt] font-bold text-rose-950 tabular-nums whitespace-nowrap">
                      {formatRupiah(dapurExtraReports.buku1.belanjaPagiSore)}
                    </strong>
                  </div>
                  <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-indigo-50 border border-indigo-200 flex flex-col justify-between min-h-[74px] p-3">
                    <span className="text-indigo-800 block text-[8.5pt] leading-tight">Subsidi Masuk</span>
                    <strong className="text-[10.5pt] font-bold text-indigo-950 tabular-nums whitespace-nowrap">
                      {formatRupiah(dapurExtraReports.buku1.subsidiMasuk)}
                    </strong>
                  </div>
                  <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex flex-col justify-between min-h-[74px] p-3">
                    <span className="text-slate-600 block text-[8.5pt] leading-tight">Sisa Saldo Mengendap</span>
                    <strong
                      className={`text-[10.5pt] font-bold tabular-nums whitespace-nowrap ${
                        dapurExtraReports.buku1.sisaSaldo < 0 ? 'text-rose-700' : 'text-slate-900'
                      }`}
                    >
                      {formatRupiah(dapurExtraReports.buku1.sisaSaldo)}
                    </strong>
                  </div>
                </div>
                {dapurExtraReports.buku1.mutations.length === 0 ? (
                  <p className="text-[9.5pt] leading-snug text-slate-600 italic py-1">
                    Belum ada mutasi Buku 1 Belanja Masak pada periode ini.
                  </p>
                ) : (
                  <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                    <table className="w-full text-[8.5pt] leading-tight border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 text-left">
                          <th className="px-2 py-1.5 border border-slate-200 whitespace-nowrap">Tanggal</th>
                          <th className="px-2 py-1.5 border border-slate-200 whitespace-nowrap">Kategori</th>
                          <th className="px-2 py-1.5 border border-slate-200">Uraian &amp; PJ</th>
                          <th className="px-2 py-1.5 border border-slate-200 text-right whitespace-nowrap">Nominal</th>
                          <th className="px-2 py-1.5 border border-slate-200 text-right whitespace-nowrap">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dapurExtraReports.buku1.mutations.map((m) => (
                          <tr key={m.id} className="break-inside-avoid">
                            <td className="px-2 py-1.5 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                              {m.tanggal}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 font-semibold text-slate-800 whitespace-nowrap">
                              {m.kategoriLabel}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 text-slate-700">
                              <span className="font-semibold text-slate-900">{m.uraian}</span>
                              {m.pj && m.pj !== '-' ? (
                                <span className="text-slate-500"> &bull; PJ: {m.pj}</span>
                              ) : null}
                            </td>
                            <td
                              className={`px-2 py-1.5 border border-slate-200 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                                m.arah === 'masuk' ? 'text-emerald-800' : 'text-rose-700'
                              }`}
                            >
                              {m.arah === 'masuk' ? '+' : '-'} {formatRupiah(m.nominal)}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                              {formatRupiah(m.saldo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 3. Buku Kas Usaha Jualan Malam Dapur (Buku 2) */}
              <div className="space-y-2 break-inside-avoid">
                <h4 className="text-[10pt] font-bold uppercase tracking-wider text-slate-900">
                  3. Buku Kas Usaha Jualan Malam Dapur (Buku 2)
                </h4>
                <div data-siap-kpi-grid="true" className="grid grid-cols-4 gap-2.5 items-stretch">
                  <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-emerald-50 border border-emerald-200 flex flex-col justify-between min-h-[74px] p-3">
                    <span className="text-emerald-800 block text-[8.5pt] leading-tight">Total Omzet Jualan</span>
                    <strong className="text-[10.5pt] font-bold text-emerald-950 tabular-nums whitespace-nowrap">
                      {formatRupiah(dapurExtraReports.buku2.omzet)}
                    </strong>
                  </div>
                  <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-rose-50 border border-rose-200 flex flex-col justify-between min-h-[74px] p-3">
                    <span className="text-rose-800 block text-[8.5pt] leading-tight">Total Modal / Pengeluaran</span>
                    <strong className="text-[10.5pt] font-bold text-rose-950 tabular-nums whitespace-nowrap">
                      {formatRupiah(dapurExtraReports.buku2.modal)}
                    </strong>
                  </div>
                  <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-amber-50 border border-amber-200 flex flex-col justify-between min-h-[74px] p-3">
                    <span className="text-amber-800 block text-[8.5pt] leading-tight">Subsidi Keluar ke Masak</span>
                    <strong className="text-[10.5pt] font-bold text-amber-950 tabular-nums whitespace-nowrap">
                      {formatRupiah(dapurExtraReports.buku2.subsidiKeluar)}
                    </strong>
                  </div>
                  <div data-siap-kpi-card="true" className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex flex-col justify-between min-h-[74px] p-3">
                    <span className="text-slate-600 block text-[8.5pt] leading-tight">Saldo Kas Jualan Bersih</span>
                    <strong
                      className={`text-[10.5pt] font-bold tabular-nums whitespace-nowrap ${
                        dapurExtraReports.buku2.saldoBersih < 0 ? 'text-rose-700' : 'text-slate-900'
                      }`}
                    >
                      {formatRupiah(dapurExtraReports.buku2.saldoBersih)}
                    </strong>
                  </div>
                </div>
                {dapurExtraReports.buku2.transactions.length === 0 ? (
                  <p className="text-[9.5pt] leading-snug text-slate-600 italic py-1">
                    Belum ada transaksi Buku 2 Usaha Jualan Malam pada periode ini.
                  </p>
                ) : (
                  <div className="rounded-xl overflow-hidden border border-slate-200 siap-table-card">
                    <table className="w-full text-[8.5pt] leading-tight border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 text-left">
                          <th className="px-2 py-1.5 border border-slate-200 whitespace-nowrap">Tanggal</th>
                          <th className="px-2 py-1.5 border border-slate-200 whitespace-nowrap">Kategori</th>
                          <th className="px-2 py-1.5 border border-slate-200">Uraian &amp; PJ</th>
                          <th className="px-2 py-1.5 border border-slate-200 text-right whitespace-nowrap">Nominal</th>
                          <th className="px-2 py-1.5 border border-slate-200 text-right whitespace-nowrap">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dapurExtraReports.buku2.transactions.map((t) => (
                          <tr key={t.id} className="break-inside-avoid">
                            <td className="px-2 py-1.5 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                              {t.tanggal}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 font-semibold text-slate-800 whitespace-nowrap">
                              {t.kategoriLabel}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 text-slate-700">
                              <span className="font-semibold text-slate-900">{t.uraian}</span>
                              {t.pj && t.pj !== '-' ? (
                                <span className="text-slate-500"> &bull; PJ: {t.pj}</span>
                              ) : null}
                            </td>
                            <td
                              className={`px-2 py-1.5 border border-slate-200 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                                t.arah === 'masuk' ? 'text-emerald-800' : 'text-rose-700'
                              }`}
                            >
                              {t.arah === 'masuk' ? '+' : '-'} {formatRupiah(t.nominal)}
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                              {formatRupiah(t.saldo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sumber tersembunyi Lembar Pengesahan baku (TTD & Stempel Digital pas & tidak terpotong) */}
          <div ref={approvalSourceRef} className="hidden" aria-hidden="true">
            <section
              data-siap-page-start="true"
              data-siap-approval="true"
              className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 print:border-slate-300 break-inside-avoid print:break-before-page overflow-visible space-y-6"
            >
              <div className="text-center border-b border-slate-200 pb-3">
                <h3 className="text-[11.5pt] font-bold uppercase tracking-wider text-slate-900">
                  Lembar Pengesahan
                </h3>
                <p className="text-[9.5pt] leading-snug text-slate-600 mt-0.5">
                  {pengaturanApproval.kota_surat}, {formatTanggalSuratIndo(todayStr)}
                </p>
              </div>

              <p className="text-[9.5pt] leading-snug text-slate-700 text-justify">
                Demikian laporan pertanggungjawaban operasional dan administrasi {pengaturanApproval.nama_pesantren} periode{' '}
                <strong className="text-slate-900">{periodWindow?.label || '-'}</strong> ini disusun dengan sebenar-benarnya berdasarkan data riil sistem informasi pesantren untuk dipergunakan sebagaimana mestinya.
              </p>

              <div className="grid grid-cols-2 gap-8 px-2 text-center text-[9.5pt] leading-snug overflow-visible pt-1">
                <div className="space-y-2 min-w-0 overflow-visible">
                  <p className="font-semibold text-slate-700">Ketua Pondok</p>
                  <div className="h-24 w-full max-w-[200px] mx-auto flex items-center justify-center relative overflow-visible">
                    {useDigitalSignature && pengaturanApproval.ttd_kepala_pondok_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={pengaturanApproval.ttd_kepala_pondok_url}
                        alt="TTD Ketua Pondok"
                        referrerPolicy="no-referrer"
                        className="h-20 w-auto max-w-full object-contain"
                      />
                    )}
                  </div>
                  <p className="font-bold text-slate-900 underline underline-offset-4 break-words">
                    {pengaturanApproval.nama_kepala_pondok}
                  </p>
                </div>

                <div className="space-y-2 min-w-0 overflow-visible">
                  <p className="font-semibold text-slate-700">Sekretaris Pondok</p>
                  <div className="h-24 w-full max-w-[200px] mx-auto flex items-center justify-center relative overflow-visible">
                    {useDigitalSignature && pengaturanApproval.ttd_sekretaris_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={pengaturanApproval.ttd_sekretaris_url}
                        alt="TTD Sekretaris Pondok"
                        referrerPolicy="no-referrer"
                        className="h-20 w-auto max-w-full object-contain"
                      />
                    )}
                  </div>
                  <p className="font-bold text-slate-900 underline underline-offset-4 break-words">
                    {pengaturanApproval.nama_sekretaris}
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-center overflow-visible">
                <div className="w-full max-w-[300px] text-center space-y-2 text-[9.5pt] leading-snug overflow-visible">
                  <p className="font-semibold text-slate-700">Mengetahui, Pengasuh Pondok</p>
                  <div className="h-28 w-full flex items-center justify-center relative overflow-visible">
                    <div className="relative inline-flex items-center justify-center overflow-visible min-w-[180px] min-h-[84px]">
                      {useDigitalSignature && pengaturanApproval.stempel_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={pengaturanApproval.stempel_url}
                          alt="Stempel Pondok"
                          referrerPolicy="no-referrer"
                          className="h-24 w-auto max-w-[115px] object-contain opacity-90 -mr-7 relative z-0 pointer-events-none"
                        />
                      )}
                      {useDigitalSignature && pengaturanApproval.ttd_pengasuh_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={pengaturanApproval.ttd_pengasuh_url}
                          alt="TTD Pengasuh Pondok"
                          referrerPolicy="no-referrer"
                          className="h-24 w-auto max-w-[180px] object-contain relative z-10"
                        />
                      )}
                    </div>
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
                    <p className="text-[10pt] font-bold uppercase tracking-widest text-slate-500">
                      Pondok Pesantren An-Nur 1 Bululawang · Malang
                    </p>
                    <h2 className="text-[12pt] font-bold text-slate-900 mt-1">
                      Laporan Operasional Divisi{' '}
                      {ALL_DIVISIONS.find((d) => d.key === scope)?.label}
                    </h2>
                    <p className="text-[10pt] leading-relaxed text-slate-600 mt-1">
                      Periode: <strong>{periodWindow?.label}</strong> ({periodWindow?.comparisonLabel})
                    </p>
                  </div>
                )}

                {renderExtraDivisionSections()}

                {showCoverAndApproval && (
                  <section
                    data-siap-page-start="true"
                    data-siap-approval="true"
                    className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 print:border-slate-300 break-inside-avoid print:break-before-page overflow-visible space-y-6"
                  >
                    <div className="text-center border-b border-slate-200 pb-3">
                      <h3 className="text-[11.5pt] font-bold uppercase tracking-wider text-slate-900">
                        Lembar Pengesahan
                      </h3>
                      <p className="text-[9.5pt] leading-snug text-slate-600 mt-0.5">
                        {pengaturanApproval.kota_surat}, {formatTanggalSuratIndo(todayStr)}
                      </p>
                    </div>

                    <p className="text-[9.5pt] leading-snug text-slate-700 text-justify">
                      Demikian laporan pertanggungjawaban operasional dan administrasi {pengaturanApproval.nama_pesantren} periode{' '}
                      <strong className="text-slate-900">{periodWindow?.label || '-'}</strong> ini disusun dengan sebenar-benarnya berdasarkan data riil sistem informasi pesantren untuk dipergunakan sebagaimana mestinya.
                    </p>

                    <div className="grid grid-cols-2 gap-8 px-2 text-center text-[9.5pt] leading-snug overflow-visible pt-1">
                      <div className="space-y-2 min-w-0 overflow-visible">
                        <p className="font-semibold text-slate-700">Ketua Pondok</p>
                        <div className="h-24 w-full max-w-[200px] mx-auto flex items-center justify-center relative overflow-visible">
                          {useDigitalSignature && pengaturanApproval.ttd_kepala_pondok_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={pengaturanApproval.ttd_kepala_pondok_url}
                              alt="TTD Ketua Pondok"
                              referrerPolicy="no-referrer"
                              className="h-20 w-auto max-w-full object-contain"
                            />
                          )}
                        </div>
                        <p className="font-bold text-slate-900 underline underline-offset-4 break-words">
                          {pengaturanApproval.nama_kepala_pondok}
                        </p>
                      </div>

                      <div className="space-y-2 min-w-0 overflow-visible">
                        <p className="font-semibold text-slate-700">Sekretaris Pondok</p>
                        <div className="h-24 w-full max-w-[200px] mx-auto flex items-center justify-center relative overflow-visible">
                          {useDigitalSignature && pengaturanApproval.ttd_sekretaris_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={pengaturanApproval.ttd_sekretaris_url}
                              alt="TTD Sekretaris Pondok"
                              referrerPolicy="no-referrer"
                              className="h-20 w-auto max-w-full object-contain"
                            />
                          )}
                        </div>
                        <p className="font-bold text-slate-900 underline underline-offset-4 break-words">
                          {pengaturanApproval.nama_sekretaris}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-center overflow-visible">
                      <div className="w-full max-w-[300px] text-center space-y-2 text-[9.5pt] leading-snug overflow-visible">
                        <p className="font-semibold text-slate-700">Mengetahui, Pengasuh Pondok</p>
                        <div className="h-28 w-full flex items-center justify-center relative overflow-visible">
                          <div className="relative inline-flex items-center justify-center overflow-visible min-w-[180px] min-h-[84px]">
                            {useDigitalSignature && pengaturanApproval.stempel_url && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={pengaturanApproval.stempel_url}
                                alt="Stempel Pondok"
                                referrerPolicy="no-referrer"
                                className="h-24 w-auto max-w-[115px] object-contain opacity-90 -mr-7 relative z-0 pointer-events-none"
                              />
                            )}
                            {useDigitalSignature && pengaturanApproval.ttd_pengasuh_url && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={pengaturanApproval.ttd_pengasuh_url}
                                alt="TTD Pengasuh Pondok"
                                referrerPolicy="no-referrer"
                                className="h-24 w-auto max-w-[180px] object-contain relative z-10"
                              />
                            )}
                          </div>
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
