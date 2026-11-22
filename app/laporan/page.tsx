'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState<boolean>(false);

  const [rawData, setRawData] = useState<AllLaporanRawData | null>(null);
  const [extraRaw, setExtraRaw] = useState<ExtraRawData>({
    kebersihanRows: [],
    koperasiTransaksiRows: [],
    koperasiProdukRows: [],
    psbRows: [],
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

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
      });
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

  return (
    <div className="max-w-7xl mx-auto space-y-5 print:max-w-none print:space-y-0">
      {/* Aturan Cetak A4 untuk PDF Bersih */}
      <style jsx global>{`
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

            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('mingguan')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'mingguan'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mingguan (Rapat Jum&apos;at)
              </button>
              <button
                type="button"
                onClick={() => setMode('bulanan')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'rentang'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Rentang Tanggal
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
              <div className="flex items-center gap-2">
                <label htmlFor="laporan-month-input" className="text-xs text-slate-600">
                  Pilih Bulan:
                </label>
                <input
                  id="laporan-month-input"
                  type="month"
                  value={monthStr}
                  onChange={(e) => setMonthStr(e.target.value)}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-900"
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

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 w-full">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-slate-50 sm:bg-transparent border border-slate-200 sm:border-0 rounded-lg px-2.5 py-1.5 sm:p-0 min-w-0">
                  <input
                    type="checkbox"
                    checked={showCoverAndApproval}
                    onChange={(e) => setShowCoverAndApproval(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 shrink-0"
                  />
                  <span className="truncate">Sampul &amp; Pengesahan</span>
                </label>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-slate-50 sm:bg-transparent border border-slate-200 sm:border-0 rounded-lg px-2.5 py-1.5 sm:p-0 min-w-0">
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
            </div>

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

          <div className={`${mobilePreviewOpen ? 'block' : 'hidden'} lg:block print:block space-y-6 print:space-y-5`}>
            {!isExtraKey(scope) && (scope !== 'gabungan' || baseSelectedDivisions.length > 0) && (
              <LaporanDocument
                bundle={bundle}
                scope={scope}
                selectedDivisions={baseSelectedDivisions}
                showCoverAndApproval={showCoverAndApproval}
                showNotaLampiran={showNotaLampiran}
                todayStr={todayStr}
              />
            )}

            {(isExtraKey(scope) || (scope === 'gabungan' && extraSelectedDivisions.length > 0)) && (
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

                {(scope === 'kebersihan' ||
                  (scope === 'gabungan' && extraSelectedDivisions.includes('kebersihan'))) && (
                  <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4 print:border-slate-300 break-inside-avoid">
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
                  <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4 print:border-slate-300 break-inside-avoid">
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
                  <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4 print:border-slate-300 break-inside-avoid">
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
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
