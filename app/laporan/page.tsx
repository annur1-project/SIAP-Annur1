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
import LaporanDocument from '@/components/LaporanDocument';
import { TransparencyBanner, useAuth } from '@/lib/auth';
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

const ALL_DIV_KEYS: LaporanDivisionKey[] = LAPORAN_DIVISIONS.map((d) => d.key);

export default function PusatLaporanPage() {
  const { canEditModule, canViewBisyaroh } = useAuth();
  const canEditLaporan = canEditModule('laporan');
  const [todayStr, setTodayStr] = useState<string>('');
  const [mode, setMode] = useState<PeriodeMode>('mingguan');
  const [anchorDate, setAnchorDate] = useState<string>('');
  const [monthStr, setMonthStr] = useState<string>('');
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');

  const [scope, setScope] = useState<LaporanScope>('gabungan');
  const [selectedDivisions, setSelectedDivisions] = useState<LaporanDivisionKey[]>(ALL_DIV_KEYS);
  const [showCoverAndApproval, setShowCoverAndApproval] = useState<boolean>(true);
  const [showNotaLampiran, setShowNotaLampiran] = useState<boolean>(true);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState<boolean>(false);

  const [rawData, setRawData] = useState<AllLaporanRawData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      setErrorMsg('');
      const data = await fetchAllLaporanRawData({ canViewBisyaroh });
      setRawData(data);
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

  const effectiveToday = todayStr || '2026-11-17';

  const periodWindow = useMemo(
    () =>
      computePeriodWindow(mode, {
        anchorDate: anchorDate || getNearestFridayIso(effectiveToday),
        monthStr: monthStr || effectiveToday.slice(0, 7),
        startDate: rangeStart || addDaysIso(effectiveToday, -6),
        endDate: rangeEnd || effectiveToday,
        todayStr: effectiveToday,
      }),
    [mode, anchorDate, monthStr, rangeStart, rangeEnd, effectiveToday]
  );

  const bundle = useMemo(() => {
    if (!rawData) return null;
    return buildAllDivisionReports(rawData, periodWindow, effectiveToday, { canViewBisyaroh });
  }, [rawData, periodWindow, effectiveToday, canViewBisyaroh]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  const handleToggleDivision = (key: LaporanDivisionKey) => {
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
    exportLaporanToExcel(bundle, scope, selectedDivisions);
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

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Perbarui Data
          </button>

          <button
            type="button"
            onClick={handleDownloadExcel}
            disabled={!bundle}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Unduh Excel (.xlsx)
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            disabled={!bundle}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
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
                    setAnchorDate((prev) => addDaysIso(prev || effectiveToday, -7))
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
                    setAnchorDate((prev) => addDaysIso(prev || effectiveToday, 7))
                  }
                  aria-label="Pekan berikutnya"
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setAnchorDate(getNearestFridayIso(effectiveToday))}
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

            <p className="text-xs text-slate-500">
              Rentang aktif: <strong className="text-slate-800">{periodWindow.label}</strong> ·{' '}
              <span>{periodWindow.comparisonLabel}</span>
            </p>
          </div>

          {/* Kanan: Jenis Laporan (Gabungan vs Per Divisi) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Layers className="w-4 h-4 text-emerald-700" />
                <span>2. Pilih Cakupan Laporan</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCoverAndApproval}
                    onChange={(e) => setShowCoverAndApproval(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>Sampul &amp; Pengesahan</span>
                </label>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showNotaLampiran}
                    onChange={(e) => setShowNotaLampiran(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>
                    Lampiran Nota
                    {bundle ? ` (${bundle.keuangan.lampiranNotaList.length})` : ''}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setScope('gabungan')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  scope === 'gabungan'
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Laporan Gabungan (Semua Divisi)
              </button>

              {LAPORAN_DIVISIONS.map((div) => (
                <button
                  key={div.key}
                  type="button"
                  onClick={() => setScope(div.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Divisi yang dimuat dalam Laporan Gabungan:
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDivisions(ALL_DIV_KEYS)}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Pilih Semua
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-700">
                  {LAPORAN_DIVISIONS.map((div) => (
                    <label key={div.key} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDivisions.includes(div.key)}
                        onChange={() => handleToggleDivision(div.key)}
                        className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span>{div.shortLabel}</span>
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

          <div className={`${mobilePreviewOpen ? 'block' : 'hidden'} lg:block print:block`}>
            <LaporanDocument
              bundle={bundle}
              scope={scope}
              selectedDivisions={selectedDivisions}
              showCoverAndApproval={showCoverAndApproval}
              showNotaLampiran={showNotaLampiran}
              todayStr={effectiveToday}
            />
          </div>
        </>
      )}
    </div>
  );
}
