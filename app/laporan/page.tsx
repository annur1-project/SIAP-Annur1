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
  const excluded = [
    'pengasuh pondok',
    'pengasuh',
    'dewan pengasuh (dzurriyah)',
    'dewan pengasuh',
    'direktur pendidikan',
  ];
  return excluded.includes(d) || excluded.includes(j);
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
          ttd_pengasuh_url: (settingRow.ttd_pengasuh_url as string | null) || null,
          ttd_kepala_pondok_url: (settingRow.ttd_kepala_pondok_url as string | null) || null,
          ttd_sekretaris_url: (settingRow.ttd_sekretaris_url as string | null) || null,
          stempel_url: (settingRow.stempel_url as string | null) || null,
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
      const st = String(row.status || row.status_pendaftaran || '').toLowerCase();
      if (/verif|lunas|diterima|resmi|aktif|selesai|disetujui/.test(st)) psbVerif += 1;
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
    const psbDetail = psbCur
      .slice()
      .sort((a, b) => b.iso.localeCompare(a.iso))
      .slice(0, 20)
      .map(({ row, iso }) => ({
        tanggal: formatIsoDisplay(iso),
        nama: extractTextField(row, ['nama_lengkap', 'nama_santri', 'nama', 'no_registrasi']),
        noReg: extractTextField(row, ['no_registrasi', 'kode_psb', 'kode'], '-'),
        program: extractTextField(row, ['program', 'jenjang', 'paket', 'kamar_tujuan', 'asal_daerah']),
        status: extractTextField(row, ['status', 'status_pendaftaran'], 'Terdaftar'),
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
        detail: kopDetail,
      },
      psb: {
        pendaftarPeriode: psbCur.length,
        prevPendaftar: psbPrevCount,
        totalSemua: psbTotalAll,
        terverifikasi: psbVerif,
        menunggu: psbMenunggu,
        totalBayar: psbTotalBayar,
        detail: psbDetail,
      },
    };
  }, [activeRange, extraRaw]);

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

  useLayoutEffect(() => {
    const docRoot = docWrapperRef.current;
    const personaliaSource = personaliaSourceRef.current;
    const kegiatanFotoSource = kegiatanFotoSourceRef.current;
    const extraSource = extraSourceRef.current;

    const cleanupDomPatches = () => {
      if (docRoot) {
        docRoot
          .querySelectorAll(
            '[data-siap-personalia-clone="true"], [data-siap-extra-clone="true"], [data-siap-kamar-grid="true"], [data-siap-kegiatan-foto-clone="true"]'
          )
          .forEach((node) => node.remove());
        docRoot
          .querySelectorAll('[data-siap-hidden-personalia="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-personalia'));
        docRoot
          .querySelectorAll('[data-siap-hidden-kamar="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-kamar'));
        docRoot
          .querySelectorAll('[data-siap-hidden-signature="true"]')
          .forEach((node) => node.removeAttribute('data-siap-hidden-signature'));
        docRoot
          .querySelectorAll('[data-siap-page-start="true"]')
          .forEach((node) => node.removeAttribute('data-siap-page-start'));
      }
    };

    cleanupDomPatches();

    if (loading || !bundle || !docRoot) {
      return cleanupDomPatches;
    }

    const searchContainer =
      (docRoot.querySelector('#pusat-laporan-dokumen') as HTMLElement | null) ||
      (docRoot.firstElementChild as HTMLElement | null) ||
      docRoot;

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

    // Atur visibilitas TTD & Stempel Digital pada Lembar Pengesahan
    if (approvalEl) {
      approvalEl.setAttribute('data-siap-page-start', 'true');
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
      const romans = txt.match(/\bDivisi\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/gi) || [];
      const uniqueRomans = new Set(romans.map((r) => r.toUpperCase().replace(/\s+/g, ' ')));
      if (uniqueRomans.size === 1) return true;
      if (el.tagName === 'SECTION') {
        const firstHeading = el.querySelector('h2, h3');
        const hTxt = (firstHeading?.textContent || '').trim();
        if (/^(?:Divisi\s+|Bab\s+)?(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/i.test(hTxt)) {
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

    // 1. Ganti blok Struktur Personalia (Divisi Administrasi) dengan susunan baku & hapus struktur lama ganda
    const administrasiVisible =
      !isExtraKey(scope) &&
      (scope === 'gabungan'
        ? baseSelectedDivisions.includes('administrasi')
        : scope === 'administrasi');

    const div1ScopeEl =
      outermostDivSections.find((el) => {
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return /\bDivisi\s+I\b/i.test(txt) && /Administrasi|Santri/i.test(txt);
      }) || null;

    if (administrasiVisible) {
      const adminScopeEl = div1ScopeEl || searchContainer;

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
            cloneWrap.innerHTML = personaliaSource.innerHTML;
            outermostFallback.setAttribute('data-siap-hidden-personalia', 'true');
            outermostFallback.parentElement.insertBefore(cloneWrap, outermostFallback);
          }
        }

        // Sapu bersih blok struktur lama ganda (I. DEWAN HARIAN & II. PLENO yang mencampur Pengasuh/Dewan Pengasuh/Direktur Pendidikan)
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

      // 1b. Susun tabel daftar kamar di Bab I menjadi 2 kolom berdampingan agar muat utuh dalam 1 halaman
      const kamarTables = Array.from(adminScopeEl.querySelectorAll('table')).filter((tbl) => {
        if (tbl.closest('[data-siap-personalia-clone="true"]')) return false;
        if (tbl.closest('[data-siap-hidden-personalia="true"]')) return false;
        if (tbl.closest('[data-siap-kamar-grid="true"]')) return false;
        const headTxt = (tbl.querySelector('thead')?.textContent || '').toLowerCase();
        const bodyRows = Array.from(tbl.querySelectorAll('tbody tr'));
        if (bodyRows.length < 4) return false;
        const bodyTxt = (tbl.querySelector('tbody')?.textContent || '').toLowerCase();
        return (
          headTxt.includes('kamar') &&
          !headTxt.includes('jabatan') &&
          !headTxt.includes('musyrif') &&
          (bodyTxt.includes('a1') || bodyTxt.includes('tahfidz') || bodyRows.length >= 6)
        );
      });

      const targetKamarTable = kamarTables[0] || null;
      if (targetKamarTable) {
        const bodyRows = Array.from(targetKamarTable.querySelectorAll<HTMLTableRowElement>('tbody tr'));
        if (bodyRows.length >= 4) {
          const mid = Math.ceil(bodyRows.length / 2);
          const leftRows = bodyRows.slice(0, mid);
          const rightRows = bodyRows.slice(mid);
          const origThead = targetKamarTable.querySelector('thead');

          const buildHalfTable = (rows: HTMLTableRowElement[]) => {
            const tbl = document.createElement('table');
            tbl.className = targetKamarTable.className || 'w-full text-xs border-collapse';
            if (origThead) {
              tbl.appendChild(origThead.cloneNode(true));
            }
            const tbody = document.createElement('tbody');
            rows.forEach((r) => tbody.appendChild(r.cloneNode(true)));
            tbl.appendChild(tbody);
            return tbl;
          };

          const kamarGrid = document.createElement('div');
          kamarGrid.setAttribute('data-siap-kamar-grid', 'true');
          kamarGrid.className = 'grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 my-2';
          const leftWrap = document.createElement('div');
          leftWrap.className = 'min-w-0 overflow-hidden';
          leftWrap.appendChild(buildHalfTable(leftRows));
          const rightWrap = document.createElement('div');
          rightWrap.className = 'min-w-0 overflow-hidden';
          rightWrap.appendChild(buildHalfTable(rightRows));
          kamarGrid.appendChild(leftWrap);
          kamarGrid.appendChild(rightWrap);

          const parentWrap = targetKamarTable.parentElement;
          const isSingleTableScrollWrap =
            parentWrap &&
            parentWrap !== adminScopeEl &&
            parentWrap.children.length === 1 &&
            /overflow/i.test(parentWrap.className || '');

          if (isSingleTableScrollWrap && parentWrap.parentElement) {
            parentWrap.setAttribute('data-siap-hidden-kamar', 'true');
            parentWrap.parentElement.insertBefore(kamarGrid, parentWrap);
          } else if (parentWrap) {
            targetKamarTable.setAttribute('data-siap-hidden-kamar', 'true');
            parentWrap.insertBefore(kamarGrid, targetKamarTable);
          }
        }
      }
    }

    // 2. Tempel Foto Dokumentasi Kegiatan pada Bab III. Kegiatan Pondok di bawah daftar pengisi acara
    const div3El =
      outermostDivSections.find((el) => {
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return (/\bDivisi\s+III\b/i.test(txt) || /^\s*III\./i.test(txt)) && /Kegiatan/i.test(txt);
      }) || null;

    if (div3El && kegiatanFotoSource && kegiatanLampiranFoto.length > 0) {
      const fotoClone = document.createElement('div');
      fotoClone.setAttribute('data-siap-kegiatan-foto-clone', 'true');
      fotoClone.className = 'mt-5 pt-4 border-t border-slate-200 space-y-3';
      fotoClone.innerHTML = kegiatanFotoSource.innerHTML;

      const pengisiCandidates = Array.from(div3El.querySelectorAll('table, div, section')).filter(
        (el) => {
          if (el === div3El) return false;
          const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
          return /Pengisi\s+Acara|Rincian\s+Pengisi|Daftar\s+Pengisi/i.test(txt) && txt.length < 15000;
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
    }

    // 3. Tempel blok Divisi XI, XII, XIII ke dalam kontainer kertas laporan utama
    //    TEPAT SETELAH blok Divisi terakhir (mis. DIVISI X · SIE LAUNDRY) & SEBELUM Lembar Pengesahan
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
    mobilePreviewOpen,
    strukturPersonalia,
    extraReports,
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
            className={`bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4 print:border-slate-300 ${
              hasBeforeXi ? 'print:break-before-page' : ''
            }`}
          >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Divisi XI · Kebersihan &amp; Piket
              </span>
              <h3 className="text-base font-extrabold text-slate-900">
                Laporan Kebersihan Lingkungan &amp; Piket Kamar
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {periodWindow?.label}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Total Jadwal / Tugas</span>
              <strong className="text-lg font-extrabold text-slate-900 tabular-nums">
                {extraReports.kebersihan.totalTugas}
              </strong>
              <span className="text-[11px] text-slate-500 block">
                Periode lalu: {extraReports.kebersihan.prevTotalTugas}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <span className="text-emerald-800 block">Selesai / Bersih</span>
              <strong className="text-lg font-extrabold text-emerald-950 tabular-nums">
                {extraReports.kebersihan.selesai}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <span className="text-amber-800 block">Belum / Evaluasi</span>
              <strong className="text-lg font-extrabold text-amber-950 tabular-nums">
                {extraReports.kebersihan.belum}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Tingkat Kepatuhan</span>
              <strong className="text-lg font-extrabold text-slate-900 tabular-nums">
                {extraReports.kebersihan.persenBersih}%
              </strong>
            </div>
          </div>

          {extraReports.kebersihan.detail.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              Belum ada catatan piket atau tugas kebersihan tercatat pada periode ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-left">
                    <th className="p-2 border border-slate-200">Tanggal</th>
                    <th className="p-2 border border-slate-200">Area / Kamar</th>
                    <th className="p-2 border border-slate-200">Tugas / Petugas</th>
                    <th className="p-2 border border-slate-200">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {extraReports.kebersihan.detail.map((row, i) => (
                    <tr key={i}>
                      <td className="p-2 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                        {row.tanggal}
                      </td>
                      <td className="p-2 border border-slate-200 font-semibold text-slate-800">
                        {row.area}
                      </td>
                      <td className="p-2 border border-slate-200 text-slate-700">{row.tugas}</td>
                      <td className="p-2 border border-slate-200 font-semibold text-slate-800">
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
          className={`bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4 print:border-slate-300 ${
            hasBeforeXii ? 'print:break-before-page' : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Divisi XII · Koperasi Pondok
              </span>
              <h3 className="text-base font-extrabold text-slate-900">
                Laporan Operasional &amp; Arus Kas Koperasi
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {periodWindow?.label}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <span className="text-emerald-800 block">Pemasukan / Penjualan</span>
              <strong className="text-base font-extrabold text-emerald-950 tabular-nums">
                {formatRupiah(extraReports.koperasi.pemasukan)}
              </strong>
              <span className="text-[11px] text-emerald-700 block">
                Lalu: {formatRupiah(extraReports.koperasi.prevPemasukan)}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
              <span className="text-rose-800 block">Pengeluaran / Kulaan</span>
              <strong className="text-base font-extrabold text-rose-950 tabular-nums">
                {formatRupiah(extraReports.koperasi.pengeluaran)}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Surplus Periode</span>
              <strong className="text-base font-extrabold text-slate-900 tabular-nums">
                {formatRupiah(extraReports.koperasi.surplus)}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Transaksi &amp; Produk</span>
              <strong className="text-base font-extrabold text-slate-900 tabular-nums">
                {extraReports.koperasi.totalTransaksi} Trx · {extraReports.koperasi.totalProduk} Item
              </strong>
            </div>
          </div>

          {extraReports.koperasi.detail.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              Belum ada transaksi koperasi tercatat pada periode ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-left">
                    <th className="p-2 border border-slate-200">Tanggal</th>
                    <th className="p-2 border border-slate-200">Keterangan / Barang</th>
                    <th className="p-2 border border-slate-200">Jenis / Metode</th>
                    <th className="p-2 border border-slate-200 text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {extraReports.koperasi.detail.map((row, i) => (
                    <tr key={i}>
                      <td className="p-2 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                        {row.tanggal}
                      </td>
                      <td className="p-2 border border-slate-200 font-semibold text-slate-800">
                        {row.keterangan}
                      </td>
                      <td className="p-2 border border-slate-200 text-slate-700">{row.jenis}</td>
                      <td
                        className={`p-2 border border-slate-200 text-right font-mono font-bold tabular-nums ${
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
          className={`bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4 print:border-slate-300 ${
            hasBeforeXiii ? 'print:break-before-page' : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Divisi XIII · Pendaftaran Santri Baru (PSB)
              </span>
              <h3 className="text-base font-extrabold text-slate-900">
                Laporan Penerimaan &amp; Verifikasi Calon Santri Baru
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {periodWindow?.label}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Pendaftar Periode Ini</span>
              <strong className="text-lg font-extrabold text-slate-900 tabular-nums">
                {extraReports.psb.pendaftarPeriode}
              </strong>
              <span className="text-[11px] text-slate-500 block">
                Total data PSB: {extraReports.psb.totalSemua} (Lalu: {extraReports.psb.prevPendaftar})
              </span>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <span className="text-emerald-800 block">Terverifikasi / Diterima</span>
              <strong className="text-lg font-extrabold text-emerald-950 tabular-nums">
                {extraReports.psb.terverifikasi}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <span className="text-amber-800 block">Menunggu / Proses</span>
              <strong className="text-lg font-extrabold text-amber-950 tabular-nums">
                {extraReports.psb.menunggu}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Pembayaran Masuk PSB</span>
              <strong className="text-base font-extrabold text-slate-900 tabular-nums">
                {formatRupiah(extraReports.psb.totalBayar)}
              </strong>
            </div>
          </div>

          {extraReports.psb.detail.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              Belum ada pendaftaran santri baru tercatat pada periode ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-left">
                    <th className="p-2 border border-slate-200">Tanggal</th>
                    <th className="p-2 border border-slate-200">No. Reg</th>
                    <th className="p-2 border border-slate-200">Nama Calon Santri</th>
                    <th className="p-2 border border-slate-200">Program / Asal</th>
                    <th className="p-2 border border-slate-200">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {extraReports.psb.detail.map((row, i) => (
                    <tr key={i}>
                      <td className="p-2 border border-slate-200 font-mono tabular-nums whitespace-nowrap">
                        {row.tanggal}
                      </td>
                      <td className="p-2 border border-slate-200 font-mono font-semibold text-slate-700">
                        {row.noReg}
                      </td>
                      <td className="p-2 border border-slate-200 font-semibold text-slate-900">
                        {row.nama}
                      </td>
                      <td className="p-2 border border-slate-200 text-slate-700">
                        {row.program}
                      </td>
                      <td className="p-2 border border-slate-200 font-semibold text-slate-800">
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
        [data-siap-hidden-kamar="true"] {
          display: none !important;
        }
        [data-siap-hidden-signature="true"] {
          visibility: hidden !important;
          opacity: 0 !important;
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
          #pusat-laporan-dokumen {
            overflow: visible !important;
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
            <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                    Struktur Personalia Pengurus Aktif
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Susunan Dewan Harian &amp; Pleno Divisi (tidak termasuk Pengasuh, Dewan Pengasuh/Dzurriyah, dan Direktur Pendidikan)
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-slate-600">
                  Total {strukturPersonalia.totalOperationalAssignments} Penugasan
                </span>
              </div>

              {/* BAGIAN I: DEWAN HARIAN */}
              <div className="space-y-1.5">
                <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                  Bagian I · Dewan Harian
                </h5>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="p-2 border border-slate-200 w-10 text-center">No</th>
                      <th className="p-2 border border-slate-200 w-56">Jabatan</th>
                      <th className="p-2 border border-slate-200">Nama Pengurus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strukturPersonalia.dewanHarianSlots.map((slot) => (
                      <tr key={slot.nomor}>
                        <td className="p-2 border border-slate-200 text-center font-mono tabular-nums">
                          {slot.nomor}
                        </td>
                        <td className="p-2 border border-slate-200 font-semibold text-slate-800">
                          {slot.jabatan}
                        </td>
                        <td className="p-2 border border-slate-200 text-slate-900">
                          {slot.names.length > 0 ? slot.names.join(', ') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* BAGIAN II: PLENO / DIVISI (A - K) */}
              <div className="space-y-2">
                <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
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
                        className={`border border-slate-200 rounded-lg overflow-hidden break-inside-avoid ${
                          isMusyrif ? 'sm:col-span-2 print:col-span-2' : ''
                        }`}
                      >
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-extrabold text-slate-900">
                            {sec.letter}. {sec.label}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-600 tabular-nums">
                            {sec.members.length} Org
                          </span>
                        </div>
                        {sec.members.length === 0 ? (
                          <p className="px-3 py-2 text-[11px] italic text-slate-400">
                            Belum ada personel ditugaskan
                          </p>
                        ) : isMusyrif ? (
                          <div className="grid grid-cols-2 gap-4 p-2.5">
                            {halves.map((half, colIdx) => {
                              const offset = colIdx === 0 ? 0 : mid;
                              return (
                                <div key={`K-col-${colIdx}`} className="border border-slate-200 rounded overflow-hidden">
                                  <table className="w-full text-[11px] border-collapse">
                                    <tbody>
                                      {half.length === 0 ? (
                                        <tr>
                                          <td className="px-2.5 py-1.5 italic text-slate-400">-</td>
                                        </tr>
                                      ) : (
                                        half.map((m, idx) => (
                                          <tr
                                            key={`K-${offset + idx}`}
                                            className="border-t first:border-t-0 border-slate-100"
                                          >
                                            <td className="px-2 py-1.5 w-6 text-slate-500 font-mono tabular-nums align-top">
                                              {offset + idx + 1}.
                                            </td>
                                            <td className="px-1.5 py-1.5 font-semibold text-slate-900 align-top">
                                              {m.nama}
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-slate-600 whitespace-nowrap align-top">
                                              {m.peran}
                                            </td>
                                          </tr>
                                        ))
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <table className="w-full text-[11px] border-collapse">
                            <tbody>
                              {sec.members.map((m, idx) => (
                                <tr key={`${sec.letter}-${idx}`} className="border-t first:border-t-0 border-slate-100">
                                  <td className="px-2.5 py-1.5 w-6 text-slate-500 font-mono tabular-nums align-top">
                                    {idx + 1}.
                                  </td>
                                  <td className="px-2 py-1.5 font-semibold text-slate-900 align-top">
                                    {m.nama}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-right text-slate-600 whitespace-nowrap align-top">
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
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                    Lampiran Dokumentasi Foto Kegiatan
                  </h4>
                  <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
                    {kegiatanLampiranFoto.length} Agenda Terdokumentasi
                  </span>
                </div>

                <div className="space-y-3">
                  {kegiatanLampiranFoto.map((ag) => (
                    <div
                      key={ag.id}
                      className="border border-slate-200 rounded-lg p-3 space-y-2 break-inside-avoid"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{ag.judul}</p>
                          <p className="text-[11px] text-slate-500">
                            {ag.tanggal ? formatTanggalSuratIndo(ag.tanggal) : '-'}
                            {ag.jamMulai ? ` · ${ag.jamMulai} WIB` : ''}
                            {ag.lokasi ? ` · ${ag.lokasi}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                          {ag.urls.length} Foto
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 print:grid-cols-3 gap-2.5">
                        {ag.urls.map((url, idx) => (
                          <div
                            key={`${ag.id}-foto-${idx}`}
                            className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 aspect-[4/3]"
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
                        <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded p-2">
                          <strong>Notulensi:</strong> {ag.notulensi}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              <div className="max-w-[210mm] mx-auto space-y-5 print:max-w-none">
                {isExtraKey(scope) && showCoverAndApproval && (
                  <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 print:border-0 print:rounded-none print:p-0 print:pb-4 border-b-2 border-b-slate-800">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      Pondok Pesantren An-Nur 1 Bululawang · Malang
                    </p>
                    <h2 className="text-xl font-extrabold text-slate-900 mt-1">
                      Laporan Operasional Divisi{' '}
                      {ALL_DIVISIONS.find((d) => d.key === scope)?.label}
                    </h2>
                    <p className="text-xs text-slate-600 mt-1">
                      Periode: <strong>{periodWindow?.label}</strong> ({periodWindow?.comparisonLabel})
                    </p>
                  </div>
                )}

                {renderExtraDivisionSections()}

                {showCoverAndApproval && (
                  <section
                    data-siap-page-start="true"
                    className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 print:border-slate-300 break-inside-avoid print:break-before-page"
                  >
                    <div className="text-center border-b border-slate-200 pb-3 mb-6">
                      <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
                        Lembar Pengesahan
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {pengaturanApproval.kota_surat}, {formatTanggalSuratIndo(todayStr)}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-6 text-center text-xs">
                      <div className="space-y-2">
                        <p className="font-semibold text-slate-700">Sekretaris Pondok</p>
                        <div className="h-16 flex items-center justify-center">
                          {useDigitalSignature && pengaturanApproval.ttd_sekretaris_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={pengaturanApproval.ttd_sekretaris_url}
                              alt="TTD Sekretaris"
                              className="max-h-14 object-contain"
                            />
                          )}
                        </div>
                        <p className="font-bold text-slate-900 underline underline-offset-4">
                          {pengaturanApproval.nama_sekretaris}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="font-semibold text-slate-700">Kepala Pondok</p>
                        <div className="h-16 flex items-center justify-center relative">
                          {useDigitalSignature && pengaturanApproval.stempel_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={pengaturanApproval.stempel_url}
                              alt="Stempel Pondok"
                              className="max-h-14 object-contain opacity-80 absolute"
                            />
                          )}
                          {useDigitalSignature && pengaturanApproval.ttd_kepala_pondok_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={pengaturanApproval.ttd_kepala_pondok_url}
                              alt="TTD Kepala Pondok"
                              className="max-h-14 object-contain relative z-10"
                            />
                          )}
                        </div>
                        <p className="font-bold text-slate-900 underline underline-offset-4">
                          {pengaturanApproval.nama_kepala_pondok}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="font-semibold text-slate-700">Mengetahui, Pengasuh Pondok</p>
                        <div className="h-16 flex items-center justify-center">
                          {useDigitalSignature && pengaturanApproval.ttd_pengasuh_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={pengaturanApproval.ttd_pengasuh_url}
                              alt="TTD Pengasuh"
                              className="max-h-14 object-contain"
                            />
                          )}
                        </div>
                        <p className="font-bold text-slate-900 underline underline-offset-4">
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
