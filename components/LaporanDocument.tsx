'use client';

import React from 'react';
import {
  ComparisonPairedBarChart,
  SixPeriodTrendChart,
} from '@/components/LaporanCharts';
import {
  formatRupiah,
  formatTanggalPendek,
  LAPORAN_DIVISIONS,
  type LaporanBundle,
  type LaporanDivisionKey,
  type LaporanScope,
  type MetricDelta,
  type TunggakanRow,
} from '@/lib/laporan';

interface LaporanDocumentProps {
  bundle: LaporanBundle;
  scope: LaporanScope;
  selectedDivisions: LaporanDivisionKey[];
  showCoverAndApproval: boolean;
  showNotaLampiran?: boolean;
  todayStr: string;
}

function DeltaText({
  delta,
  unit = '',
  isCurrency = false,
  invertGood = false,
}: {
  delta: MetricDelta;
  unit?: string;
  isCurrency?: boolean;
  invertGood?: boolean;
}) {
  if (delta.diff === 0) {
    return (
      <span className="text-[11px] font-medium text-slate-500 tabular-nums">
        Sama dgn periode lalu ({isCurrency ? formatRupiah(delta.previous) : `${delta.previous}${unit}`})
      </span>
    );
  }
  const sign = delta.diff > 0 ? '+' : '';
  const absFormatted = isCurrency
    ? `${delta.diff > 0 ? '+' : '-'}${formatRupiah(Math.abs(delta.diff))}`
    : `${sign}${delta.diff}${unit}`;
  const pctStr = delta.pct !== null ? ` (${sign}${delta.pct}%)` : '';
  const isGood = invertGood ? delta.diff < 0 : delta.diff > 0;
  const colorCls = isGood ? 'text-emerald-700' : 'text-amber-700';

  return (
    <span className={`text-[11px] font-semibold tabular-nums ${colorCls}`}>
      {absFormatted}
      {pctStr} dari periode lalu
    </span>
  );
}

function KopSuratResmi({ bundle }: { bundle: LaporanBundle }) {
  const { pengaturan } = bundle;
  if (pengaturan.kop_surat_url) {
    return (
      <div className="border-b-2 border-slate-900 pb-2 mb-5">
        <div className="w-full max-w-[17.46cm] mx-auto aspect-[1746/413] flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pengaturan.kop_surat_url}
            alt="Kop Surat Resmi Pondok Pesantren"
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-600 border-t border-slate-300 pt-1">
          <span className="font-semibold uppercase tracking-wider">Dokumen Laporan Resmi</span>
          <span className="font-bold text-emerald-800 tabular-nums">{bundle.window.shortLabel}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="border-b-2 border-slate-900 pb-3 mb-5">
      <div className="flex items-center justify-between gap-4 border-b border-slate-400 pb-3">
        <div className="w-16 h-16 shrink-0 flex items-center justify-center border border-slate-200 rounded-lg bg-white overflow-hidden">
          {pengaturan.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pengaturan.logo_url}
              alt="Logo Pesantren"
              className="w-14 h-14 object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-xs font-extrabold text-emerald-800 tracking-tight text-center leading-tight">
              AN-NUR
              <br />1
            </span>
          )}
        </div>
        <div className="flex-1 text-center">
          <p className="text-base font-bold text-slate-900 tracking-wide">
            معهد النور الأول الإسلامي
          </p>
          <h2 className="text-lg font-extrabold text-slate-950 tracking-tight uppercase">
            {pengaturan.nama_pesantren || 'PONDOK PESANTREN AN-NUR 1 BULULAWANG'}
          </h2>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {pengaturan.alamat_lengkap ||
              'Jl. Diponegoro IV / 2-6 Bululawang (65171) Malang - Jawa Timur'}
            {pengaturan.no_telepon ? ` · Telp. ${pengaturan.no_telepon}` : ''}
          </p>
        </div>
        <div className="min-w-[130px] max-w-[170px] shrink-0 text-right hidden sm:block">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Dokumen Resmi
          </p>
          <p className="text-[11px] font-bold text-emerald-800 tabular-nums leading-snug mt-0.5">
            {bundle.window.shortLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({
  numberLabel,
  title,
  pj,
}: {
  numberLabel: string;
  title: string;
  pj?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-300 pb-2 mb-4 pt-2 break-after-avoid">
      <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
        {numberLabel}. {title}
      </h3>
      {pj && <span className="text-xs text-slate-500">Penanggung Jawab: {pj}</span>}
    </div>
  );
}

function TunggakanTableBlock({
  title,
  rows,
}: {
  title: string;
  rows: TunggakanRow[];
}) {
  const totalNominal = rows.reduce((s, r) => s + r.totalSemua, 0);
  return (
    <div className="mb-5 break-inside-avoid">
      <h5 className="text-xs font-bold text-slate-900 mb-1.5">
        {title} ({rows.length} santri · Total {formatRupiah(totalNominal)})
      </h5>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-2 border border-slate-200 rounded px-3">
          Tidak ada santri pada kategori tunggakan ini.
        </p>
      ) : (
        <table className="w-full text-[11px] border-collapse border border-slate-300">
          <thead>
            <tr className="bg-emerald-50 text-slate-900">
              <th className="border border-slate-300 px-2 py-1.5 text-center w-8">No</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left">Nama Santri</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left">Kamar</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left">Tanggungan Bulan</th>
              <th className="border border-slate-300 px-2 py-1.5 text-center w-12">Bln</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Tarif/Bln</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.santriId} className={idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                  {idx + 1}
                </td>
                <td className="border border-slate-300 px-2 py-1 font-medium text-slate-900">
                  {r.nama}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-slate-700">{r.kamar}</td>
                <td className="border border-slate-300 px-2 py-1 text-slate-700">
                  {r.rentangBulan}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                  {r.jumlahBulan}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-right tabular-nums font-mono">
                  {formatRupiah(r.tarifSpp)}
                </td>
                <td className="border border-slate-300 px-2 py-1 text-right font-semibold tabular-nums font-mono">
                  {formatRupiah(r.totalSemua)}
                </td>
              </tr>
            ))}
            <tr className="bg-amber-50 font-bold text-slate-900">
              <td colSpan={6} className="border border-slate-300 px-2 py-1.5 text-right">
                TOTAL
              </td>
              <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-mono">
                {formatRupiah(totalNominal)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function LaporanDocument({
  bundle,
  scope,
  selectedDivisions,
  showCoverAndApproval,
  showNotaLampiran = true,
  todayStr,
}: LaporanDocumentProps) {
  const activeDivKeys: LaporanDivisionKey[] =
    scope === 'gabungan' ? selectedDivisions : [scope];
  const hasDiv = (k: LaporanDivisionKey) => activeDivKeys.includes(k);

  const scopeTitle =
    scope === 'gabungan'
      ? 'LAPORAN GABUNGAN PENGURUS'
      : `LAPORAN ${(LAPORAN_DIVISIONS.find((d) => d.key === scope)?.label || scope).toUpperCase()}`;

  const periodeBadge =
    bundle.window.mode === 'mingguan'
      ? 'Laporan Mingguan — Rapat Rutin Jum\'at'
      : bundle.window.mode === 'bulanan'
      ? 'Laporan Bulanan'
      : 'Laporan Rentang Tanggal';

  const kamarHalf = Math.ceil(bundle.administrasi.kamarCounts.length / 2);
  const kamarLeft = bundle.administrasi.kamarCounts.slice(0, kamarHalf);
  const kamarRight = bundle.administrasi.kamarCounts.slice(kamarHalf);

  return (
    <div
      id="pusat-laporan-dokumen"
      className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 sm:p-8 md:p-10 print:border-0 print:rounded-none print:shadow-none print:p-0 text-slate-900 overflow-x-auto max-w-full"
    >
      {/* ================================================================= */}
      {/* HALAMAN 1: SAMPUL RESMI (COVER)                                   */}
      {/* ================================================================= */}
      {showCoverAndApproval && (
        <section className="print:min-h-[250mm] flex flex-col justify-between border border-slate-200 print:border-0 rounded-xl p-6 sm:p-8 print:p-12 bg-gradient-to-br from-white via-white to-emerald-50/40 print:bg-white mb-8 print:mb-0 print:break-after-page">
          <div className="flex items-center justify-between border-b-2 border-emerald-700 pb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl border border-emerald-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                {bundle.pengaturan.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bundle.pengaturan.logo_url}
                    alt="Logo Pondok"
                    className="w-12 h-12 object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-sm font-extrabold text-emerald-800">AN-1</span>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
                  {bundle.pengaturan.nama_pesantren || 'Pondok Pesantren An-Nur 1 Bululawang'}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {bundle.pengaturan.alamat_lengkap ||
                    'Jl. Diponegoro IV / 2-6 Bululawang, Malang, Jawa Timur'}
                </p>
              </div>
            </div>
          </div>

          <div className="my-6 print:my-12">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-3">
              {periodeBadge}
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight leading-tight">
              {scopeTitle}
            </h1>
            <p className="text-xl font-bold text-emerald-800 mt-3">{bundle.window.label}</p>
            <p className="text-sm text-slate-500 mt-1">{bundle.window.comparisonLabel}</p>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                Cakupan Data Laporan (Real Sistem):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-800">
                {LAPORAN_DIVISIONS.filter((d) => hasDiv(d.key)).map((d) => (
                  <div key={d.key} className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-emerald-700 w-6">
                      {d.romawi}.
                    </span>
                    <span className="font-medium">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Disusun oleh:{' '}
              <strong className="text-slate-800">
                {scope === 'keuangan'
                  ? `Bendahara (${bundle.pengaturan.nama_bendahara || 'Bendahara Pondok'})`
                  : `Sekretaris & Pengurus (${bundle.pengaturan.nama_sekretaris || 'Sekretaris'})`}
              </strong>
            </span>
            <span className="tabular-nums">Dicetak: {formatTanggalPendek(todayStr)}</span>
          </div>
        </section>
      )}

      {/* ================================================================= */}
      {/* KOP SURAT & RINGKASAN EKSEKUTIF + GRAFIK PERBANDINGAN             */}
      {/* ================================================================= */}
      <KopSuratResmi bundle={bundle} />

      {scope === 'gabungan' && (
        <section className="mb-8">
          <div className="mb-4">
            <h3 className="text-base font-extrabold text-slate-900">
              Ringkasan Eksekutif & Perbandingan Periode
            </h3>
            <p className="text-xs text-slate-500">
              {bundle.window.label} · {bundle.window.comparisonLabel}
            </p>
          </div>

          {/* Grid KPI Lintas Divisi */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60">
              <p className="text-[11px] font-semibold text-slate-500">Total Penghuni Pondok</p>
              <p className="text-lg font-extrabold text-slate-900 tabular-nums mt-0.5">
                {bundle.administrasi.totalKeseluruhan} orang
              </p>
              <p className="text-[11px] text-slate-600 tabular-nums">
                {bundle.administrasi.totalSantriAktif} santri · {bundle.administrasi.totalSantriNdalem} ndalem ·{' '}
                {bundle.administrasi.totalPengurusAktif} pengurus
              </p>
            </div>

            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60">
              <p className="text-[11px] font-semibold text-slate-500">Pemasukan Keuangan</p>
              <p className="text-lg font-extrabold text-slate-900 tabular-nums font-mono mt-0.5">
                {formatRupiah(bundle.keuangan.masukTotal.current)}
              </p>
              <DeltaText delta={bundle.keuangan.masukTotal} isCurrency />
            </div>

            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60">
              <p className="text-[11px] font-semibold text-slate-500">Kehadiran Sholat Jamaah</p>
              <p className="text-lg font-extrabold text-slate-900 tabular-nums mt-0.5">
                {bundle.jamaah.persenHadir.current}%
              </p>
              <DeltaText delta={bundle.jamaah.persenHadir} unit="%" />
            </div>

            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60">
              <p className="text-[11px] font-semibold text-slate-500">Setoran Sie Laundry</p>
              <p className="text-lg font-extrabold text-slate-900 tabular-nums mt-0.5">
                {bundle.laundry.totalPotong.current} potong
              </p>
              <DeltaText delta={bundle.laundry.totalPotong} unit=" potong" />
            </div>
          </div>

          {/* Grafik Perbandingan Lintas Divisi */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <ComparisonPairedBarChart
              title="Perbandingan Aktivitas Divisi"
              subtitle="Perbandingan angka aktual periode ini terhadap periode sebelumnya"
              items={bundle.charts.crossDivisionCounts}
              currentLabel="Periode Ini"
              previousLabel="Periode Lalu"
            />
            <ComparisonPairedBarChart
              title="Perbandingan Keuangan (Tunai & Transfer)"
              subtitle="Arus masuk & pengeluaran dibandingkan periode sebelumnya"
              items={bundle.charts.keuanganComparison}
              currentLabel="Periode Ini"
              previousLabel="Periode Lalu"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ComparisonPairedBarChart
              title="Perbandingan Persentase Kedisiplinan"
              subtitle="Kehadiran Sholat Jamaah & Ketepatan Masak Dapur (%)"
              items={bundle.charts.disiplinPersenComparison}
              currentLabel="Periode Ini"
              previousLabel="Periode Lalu"
            />
            <SixPeriodTrendChart
              title={`Tren 6 ${bundle.window.mode === 'bulanan' ? 'Bulan' : 'Pekan'} Terakhir — Pemasukan (Juta Rp)`}
              subtitle="Perkembangan total pemasukan kas & transfer"
              points={bundle.charts.trendPoints}
              metricKey="keuanganMasukJuta"
              unitLabel="jt"
            />
          </div>
        </section>
      )}

      {/* ================================================================= */}
      {/* STRUKTUR PERSONALIA (UNTUK GABUNGAN / ADMINISTRASI)               */}
      {/* ================================================================= */}
      {(scope === 'gabungan' || scope === 'administrasi') && (
        <section className="mb-8 break-inside-avoid">
          <SectionHeading
            numberLabel="A"
            title="Struktur Personalia Pengurus Aktif"
            pj="Data Pengurus"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3.5">
              <h4 className="font-bold text-slate-900 mb-2 border-b border-slate-200 pb-1">
                I. Dewan Harian
              </h4>
              {bundle.personalia.dewanHarian.length === 0 ? (
                <p className="text-slate-500">Belum ada data Dewan Harian di modul Pengurus.</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {bundle.personalia.dewanHarian.map((d, i) => (
                      <tr key={`${d.nama}-${i}`} className="border-b border-slate-100 last:border-0">
                        <td className="py-1 font-medium text-slate-600 w-40">{d.jabatan}</td>
                        <td className="py-1 font-semibold text-slate-900">: {d.nama}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="border border-slate-200 rounded-lg p-3.5">
              <h4 className="font-bold text-slate-900 mb-2 border-b border-slate-200 pb-1">
                II. Pleno / Koordinator Divisi
              </h4>
              {bundle.personalia.plenoDivisi.length === 0 ? (
                <p className="text-slate-500">Belum ada penugasan divisi tercatat.</p>
              ) : (
                <div className="space-y-1.5">
                  {bundle.personalia.plenoDivisi.map((grp) => (
                    <div key={grp.divisi} className="flex gap-2">
                      <span className="font-semibold text-slate-700 w-36 shrink-0">
                        {grp.divisi}
                      </span>
                      <span className="text-slate-800">
                        : {grp.anggota.map((a) => a.nama).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================= */}
      {/* I. ADMINISTRASI & DATA SANTRI REAL                                */}
      {/* ================================================================= */}
      {hasDiv('administrasi') && (
        <section className="mb-8">
          <SectionHeading
            numberLabel="I"
            title="Administrasi & Data Santri Real"
            pj="Sekretaris"
          />

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-2.5">
              <p className="text-slate-500">Santri Aktif Kamar</p>
              <p className="text-base font-bold tabular-nums">{bundle.administrasi.totalSantriAktif}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-2.5">
              <p className="text-slate-500">Santri Ndalem</p>
              <p className="text-base font-bold tabular-nums">{bundle.administrasi.totalSantriNdalem}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-2.5">
              <p className="text-slate-500">Pengurus Aktif</p>
              <p className="text-base font-bold tabular-nums">{bundle.administrasi.totalPengurusAktif}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-2.5 bg-emerald-50/50">
              <p className="text-emerald-800 font-semibold">Total Keseluruhan</p>
              <p className="text-base font-extrabold text-emerald-900 tabular-nums">
                {bundle.administrasi.totalKeseluruhan}
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-2.5">
              <p className="text-slate-500">Santri Masuk Baru</p>
              <p className="text-base font-bold tabular-nums">
                {bundle.administrasi.masukPeriodeIni.current}
              </p>
              <DeltaText delta={bundle.administrasi.masukPeriodeIni} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <table className="w-full text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-sky-50 text-slate-900">
                  <th className="border border-slate-300 px-2 py-1.5 w-10">No</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left">Kamar</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right w-20">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {kamarLeft.map((k, idx) => (
                  <tr key={k.kamar}>
                    <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 font-medium">{k.kamar}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                      {k.jumlah}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="w-full text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-sky-50 text-slate-900">
                  <th className="border border-slate-300 px-2 py-1.5 w-10">No</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left">Kamar</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right w-20">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {kamarRight.map((k, idx) => (
                  <tr key={k.kamar}>
                    <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                      {kamarHalf + idx + 1}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 font-medium">{k.kamar}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                      {k.jumlah}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bundle.administrasi.santriNdalemList.length > 0 && (
            <div className="mb-4 break-inside-avoid">
              <h5 className="text-xs font-bold text-slate-800 mb-1.5">
                Daftar Santri Ikut Ndalem ({bundle.administrasi.santriNdalemList.length})
              </h5>
              <table className="w-full text-[11px] border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-1 w-10">No</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Nama Santri</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Keterangan Ndalem</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.administrasi.santriNdalemList.map((s, idx) => (
                    <tr key={`${s.nama}-${idx}`}>
                      <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 font-medium">{s.nama}</td>
                      <td className="border border-slate-300 px-2 py-1">{s.keterangan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {bundle.administrasi.santriBoyongAll.length > 0 && (
            <div className="break-inside-avoid">
              <h5 className="text-xs font-bold text-slate-800 mb-1.5">
                Catatan Santri Boyong / Pindah ({bundle.administrasi.santriBoyongAll.length})
              </h5>
              <table className="w-full text-[11px] border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-1 w-10">No</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Nama Santri</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Kamar</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.administrasi.santriBoyongAll.slice(0, 20).map((s, idx) => (
                    <tr key={`${s.nama}-${idx}`}>
                      <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 font-medium">{s.nama}</td>
                      <td className="border border-slate-300 px-2 py-1">{s.kamar}</td>
                      <td className="border border-slate-300 px-2 py-1">{s.keterangan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* II. KEUANGAN PESANTREN (ALA BENDAHARA)                            */}
      {/* ================================================================= */}
      {hasDiv('keuangan') && (
        <section className="mb-8 print:break-before-page">
          <SectionHeading
            numberLabel="II"
            title="Laporan Keuangan Pesantren"
            pj={bundle.pengaturan.nama_bendahara || 'Bendahara Pondok'}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Pemasukan</p>
              <p className="text-base font-extrabold text-slate-900 tabular-nums font-mono mt-0.5">
                {formatRupiah(bundle.keuangan.masukTotal.current)}
              </p>
              <DeltaText delta={bundle.keuangan.masukTotal} isCurrency />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Pengeluaran</p>
              <p className="text-base font-extrabold text-slate-900 tabular-nums font-mono mt-0.5">
                {formatRupiah(bundle.keuangan.keluarTotal.current)}
              </p>
              <DeltaText delta={bundle.keuangan.keluarTotal} isCurrency invertGood />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Syahriyah Transfer (Periode)</p>
              <p className="text-base font-extrabold text-sky-900 tabular-nums font-mono mt-0.5">
                {formatRupiah(bundle.keuangan.masukTransfer.current)}
              </p>
              <DeltaText delta={bundle.keuangan.masukTransfer} isCurrency />
            </div>
            <div className="border border-slate-200 rounded-lg p-3 bg-amber-50/50">
              <p className="text-amber-900 font-semibold">Total Tunggakan Syahriah</p>
              <p className="text-base font-extrabold text-amber-950 tabular-nums font-mono mt-0.5">
                {formatRupiah(bundle.keuangan.totalTunggakanNominal)}
              </p>
              <span className="text-[11px] text-amber-800">
                {bundle.keuangan.totalSantriMenunggak} santri menunggak
              </span>
            </div>
          </div>

          {/* Grafik Keuangan khusus divisi */}
          {scope === 'keuangan' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              <ComparisonPairedBarChart
                title="Perbandingan Arus Kas (Tunai & Transfer)"
                subtitle={bundle.window.comparisonLabel}
                items={bundle.charts.keuanganComparison}
                currentLabel="Periode Ini"
                previousLabel="Periode Lalu"
              />
              <SixPeriodTrendChart
                title={`Tren Pemasukan 6 ${bundle.window.mode === 'bulanan' ? 'Bulan' : 'Pekan'} Terakhir`}
                subtitle="Nominal pemasukan dalam jutaan Rupiah"
                points={bundle.charts.trendPoints}
                metricKey="keuanganMasukJuta"
                unitLabel="jt"
              />
            </div>
          )}

          {/* Ringkasan Saldo 4 Dompet Tunai + Syahriyah Transfer & Rekap Tunggakan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 text-xs">
            <div className="border border-slate-200 rounded-lg p-3.5">
              <h5 className="font-bold text-slate-900 mb-2">Posisi Saldo 4 Dompet (Kas Tunai)</h5>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-1 text-slate-600">1. Dompet Pendaftaran (Tunai)</td>
                    <td className="py-1 text-right font-semibold tabular-nums font-mono">
                      {formatRupiah(bundle.keuangan.saldoDompetSaatIni.pendaftaran)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1 text-slate-600">2. Dompet Syahriyah &amp; Tahunan (Tunai)</td>
                    <td className="py-1 text-right font-semibold tabular-nums font-mono">
                      {formatRupiah(bundle.keuangan.saldoDompetSaatIni.operasional)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1 text-slate-600">3. Dompet Kas Umum (Tunai)</td>
                    <td className="py-1 text-right font-semibold tabular-nums font-mono">
                      {formatRupiah(bundle.keuangan.saldoDompetSaatIni.kas_pondok)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1 text-slate-600">4. Dompet MDA / Madin (Tunai)</td>
                    <td className="py-1 text-right font-semibold tabular-nums font-mono">
                      {formatRupiah(bundle.keuangan.saldoDompetSaatIni.mda)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1.5 font-bold text-slate-900">Total Saldo 4 Dompet Tunai</td>
                    <td className="py-1.5 text-right font-extrabold text-emerald-800 tabular-nums font-mono">
                      {formatRupiah(bundle.keuangan.saldoDompetSaatIni.total)}
                    </td>
                  </tr>
                  <tr className="bg-sky-50/70">
                    <td className="py-1.5 px-1.5 font-bold text-sky-900">
                      Syahriyah Transfer (Laporan Bank Terpisah)
                    </td>
                    <td className="py-1.5 px-1.5 text-right font-extrabold text-sky-900 tabular-nums font-mono">
                      {formatRupiah(bundle.keuangan.syahriyahTransfer.netAllTime)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border border-slate-200 rounded-lg p-3.5">
              <h5 className="font-bold text-slate-900 mb-2">
                Rekap Kelompok Tunggakan Syahriah
              </h5>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-1 text-slate-600">
                      Menunggak 1 Bulan ({bundle.keuangan.tunggakan1Bulan.length} santri)
                    </td>
                    <td className="py-1 text-right font-semibold tabular-nums font-mono">
                      {formatRupiah(
                        bundle.keuangan.tunggakan1Bulan.reduce((s, r) => s + r.totalSemua, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-1 text-slate-600">
                      Menunggak 2 Bulan ({bundle.keuangan.tunggakan2Bulan.length} santri)
                    </td>
                    <td className="py-1 text-right font-semibold tabular-nums font-mono">
                      {formatRupiah(
                        bundle.keuangan.tunggakan2Bulan.reduce((s, r) => s + r.totalSemua, 0)
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1 text-slate-600">
                      Menunggak &gt; 2 Bulan ({bundle.keuangan.tunggakanLebih2Bulan.length} santri)
                    </td>
                    <td className="py-1 text-right font-semibold tabular-nums font-mono">
                      {formatRupiah(
                        bundle.keuangan.tunggakanLebih2Bulan.reduce((s, r) => s + r.totalSemua, 0)
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="pt-2 font-bold text-slate-900">
                      Total Tunggakan ({bundle.keuangan.totalSantriMenunggak} santri)
                    </td>
                    <td className="pt-2 text-right font-extrabold text-amber-800 tabular-nums font-mono">
                      {formatRupiah(bundle.keuangan.totalTunggakanNominal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail Tunggakan 1 Bulan, 2 Bulan, > 2 Bulan */}
          <TunggakanTableBlock
            title="Tunggakan Santri 1 Bulan"
            rows={bundle.keuangan.tunggakan1Bulan}
          />
          <TunggakanTableBlock
            title="Tunggakan Santri 2 Bulan"
            rows={bundle.keuangan.tunggakan2Bulan}
          />
          <TunggakanTableBlock
            title="Tunggakan Santri Lebih dari 2 Bulan"
            rows={bundle.keuangan.tunggakanLebih2Bulan}
          />

          {/* Buku Kas Tunai & Transfer per Minggu */}
          {bundle.keuangan.weeklyBuckets.map((wk) => (
            <div key={wk.mingguKe} className="mb-6 break-inside-avoid">
              <h5 className="text-xs font-bold text-slate-900 mb-1.5">
                Buku Kas Tunai — {wk.label} ({wk.rentang})
              </h5>
              <table className="w-full text-[11px] border-collapse border border-slate-300 mb-2">
                <thead>
                  <tr className="bg-emerald-50">
                    <th className="border border-slate-300 px-1.5 py-1 w-8">No</th>
                    <th className="border border-slate-300 px-1.5 py-1 text-left w-22">Tanggal</th>
                    <th className="border border-slate-300 px-1.5 py-1 text-left">Nama / Uraian</th>
                    <th className="border border-slate-300 px-1.5 py-1 text-left">Bulan/Kat</th>
                    <th className="border border-slate-300 px-1.5 py-1 text-right">Debit</th>
                    <th className="border border-slate-300 px-1.5 py-1 text-right">Kredit</th>
                    <th className="border border-slate-300 px-1.5 py-1 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-amber-50/70 font-semibold">
                    <td className="border border-slate-300 px-1.5 py-1 text-center">-</td>
                    <td className="border border-slate-300 px-1.5 py-1" colSpan={3}>
                      Saldo Awal {wk.label}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums font-mono">
                      {formatRupiah(wk.tunaiSaldoAwal)}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right">-</td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums font-mono">
                      {formatRupiah(wk.tunaiSaldoAwal)}
                    </td>
                  </tr>
                  {wk.tunaiRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="border border-slate-300 px-2 py-2 text-center text-slate-500 italic"
                      >
                        Tidak ada mutasi tunai pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    wk.tunaiRows.map((row) => (
                      <tr key={`${wk.mingguKe}-${row.no}`}>
                        <td className="border border-slate-300 px-1.5 py-1 text-center tabular-nums">
                          {row.no}
                        </td>
                        <td className="border border-slate-300 px-1.5 py-1 tabular-nums">
                          {formatTanggalPendek(row.tanggal)}
                        </td>
                        <td className="border border-slate-300 px-1.5 py-1 font-medium">
                          {row.uraian}
                        </td>
                        <td className="border border-slate-300 px-1.5 py-1 text-slate-600">
                          {row.bulan || row.keterangan || '-'}
                        </td>
                        <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums font-mono">
                          {row.debit > 0 ? formatRupiah(row.debit) : '-'}
                        </td>
                        <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums font-mono">
                          {row.kredit > 0 ? formatRupiah(row.kredit) : '-'}
                        </td>
                        <td className="border border-slate-300 px-1.5 py-1 text-right font-semibold tabular-nums font-mono">
                          {formatRupiah(row.saldo)}
                        </td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-amber-100/70 font-bold text-slate-900">
                    <td colSpan={4} className="border border-slate-300 px-1.5 py-1 text-right">
                      SALDO AKHIR {wk.label.toUpperCase()}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums font-mono">
                      {formatRupiah(wk.tunaiDebit)}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums font-mono">
                      {formatRupiah(wk.tunaiKredit)}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums font-mono">
                      {formatRupiah(wk.tunaiSaldoAkhir)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {wk.transferRows.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-700 mb-1">
                    Rincian Syahriyah Transfer — {wk.label} ({wk.transferRows.length} transaksi · Total{' '}
                    {formatRupiah(wk.transferDebit)})
                  </p>
                  <table className="w-full text-[11px] border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-sky-50">
                        <th className="border border-slate-300 px-1.5 py-1 w-8">No</th>
                        <th className="border border-slate-300 px-1.5 py-1 text-left w-22">Tanggal</th>
                        <th className="border border-slate-300 px-1.5 py-1 text-left">Nama</th>
                        <th className="border border-slate-300 px-1.5 py-1 text-right">Nominal</th>
                        <th className="border border-slate-300 px-1.5 py-1 text-left">Keterangan</th>
                        <th className="border border-slate-300 px-1.5 py-1 text-center w-14">Bukti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wk.transferRows.map((tf) => (
                        <tr key={`${wk.mingguKe}-tf-${tf.no}`}>
                          <td className="border border-slate-300 px-1.5 py-1 text-center tabular-nums">
                            {tf.no}
                          </td>
                          <td className="border border-slate-300 px-1.5 py-1 tabular-nums">
                            {formatTanggalPendek(tf.tanggal)}
                          </td>
                          <td className="border border-slate-300 px-1.5 py-1 font-medium">{tf.nama}</td>
                          <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums font-mono">
                            {formatRupiah(tf.nominal)}
                          </td>
                          <td className="border border-slate-300 px-1.5 py-1">{tf.keterangan}</td>
                          <td className="border border-slate-300 px-1.5 py-1 text-center">{tf.bukti}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {/* Rekap Perbandingan Mingguan + Bisyaroh + LAZIZ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 break-inside-avoid">
            <div>
              <h5 className="text-xs font-bold text-slate-900 mb-1.5">
                Rekapitulasi Tunai vs Transfer Bank
              </h5>
              <table className="w-full text-[11px] border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-1 text-left">Periode</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Tunai Masuk</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Tunai Keluar</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Transfer Masuk</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.keuangan.weeklyBuckets.map((wk) => (
                    <tr key={`rek-${wk.mingguKe}`}>
                      <td className="border border-slate-300 px-2 py-1 font-medium">{wk.label}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums font-mono">
                        {formatRupiah(wk.tunaiDebit)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums font-mono">
                        {formatRupiah(wk.tunaiKredit)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums font-mono">
                        {formatRupiah(wk.transferDebit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {bundle.keuangan.bisyarohList.length > 0 && (
              <div>
                <h5 className="text-xs font-bold text-slate-900 mb-1.5">
                  Daftar Anggaran Bisyaroh Pengurus (Total {formatRupiah(bundle.keuangan.totalBisyaroh)})
                </h5>
                <table className="w-full text-[11px] border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-amber-50">
                      <th className="border border-slate-300 px-2 py-1 w-8">No</th>
                      <th className="border border-slate-300 px-2 py-1 text-left">Struktur</th>
                      <th className="border border-slate-300 px-2 py-1 text-left">Nama</th>
                      <th className="border border-slate-300 px-2 py-1 text-right">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.keuangan.bisyarohList.map((b) => (
                      <tr key={b.no}>
                        <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                          {b.no}
                        </td>
                        <td className="border border-slate-300 px-2 py-1">{b.struktur}</td>
                        <td className="border border-slate-300 px-2 py-1 font-medium">{b.nama}</td>
                        <td className="border border-slate-300 px-2 py-1 text-right tabular-nums font-mono">
                          {formatRupiah(b.jumlah)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Lampiran Scan Nota Pembelian & Bukti Transfer */}
          {showNotaLampiran && (
            <div className="mt-6 pt-4 border-t border-slate-300">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Lampiran Scan Nota Pembelian &amp; Bukti Transfer ({bundle.keuangan.lampiranNotaList.length} Berkas)
                </h5>
                <span className="text-[10.5px] text-slate-500">
                  Periode {bundle.window.shortLabel}
                </span>
              </div>

              {bundle.keuangan.lampiranNotaList.length === 0 ? (
                <p className="text-xs text-slate-500 border border-slate-200 rounded-lg p-3 italic">
                  Belum ada lampiran scan nota pembelian atau bukti transfer pada rentang periode ini.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-4">
                  {bundle.keuangan.lampiranNotaList.map((lamp, idx) => (
                    <div
                      key={`${lamp.id}-${idx}`}
                      className="break-inside-avoid border border-slate-300 rounded-lg p-3 bg-white flex flex-col justify-between gap-2"
                    >
                      <div className="space-y-1 border-b border-slate-200 pb-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">
                            {idx + 1}. {lamp.metode === 'transfer' ? 'Bukti Transfer' : 'Scan Nota'}
                          </span>
                          <span className="font-mono font-extrabold text-slate-900 tabular-nums">
                            {formatRupiah(lamp.nominal)}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-800">{lamp.kategori}</p>
                        <p className="text-slate-600 leading-snug">
                          {formatTanggalPendek(lamp.tanggal)} &middot; {lamp.dompetLabel}
                          {lamp.noKuitansi ? ` · ${lamp.noKuitansi}` : ''}
                        </p>
                        {lamp.keterangan && lamp.keterangan !== '-' && (
                          <p className="text-[10.5px] text-slate-500 line-clamp-2">{lamp.keterangan}</p>
                        )}
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded p-2 flex items-center justify-center min-h-[160px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={lamp.url}
                          alt={`Lampiran ${lamp.metode === 'transfer' ? 'Bukti Transfer' : 'Nota'} - ${lamp.kategori}`}
                          className="max-h-[240px] w-auto max-w-full object-contain mx-auto"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* III. KEGIATAN PONDOK                                              */}
      {/* ================================================================= */}
      {hasDiv('kegiatan') && (
        <section className="mb-8">
          <SectionHeading numberLabel="III" title="Kegiatan Pondok" pj="Sie Kegiatan" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Agenda</p>
              <p className="text-base font-bold tabular-nums">{bundle.kegiatan.totalAgenda.current}</p>
              <DeltaText delta={bundle.kegiatan.totalAgenda} unit=" agenda" />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Sudah Terlaksana</p>
              <p className="text-base font-bold tabular-nums text-emerald-700">
                {bundle.kegiatan.selesaiCount}
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Kegiatan Rutin</p>
              <p className="text-base font-bold tabular-nums">{bundle.kegiatan.rutinCount}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Event Besar</p>
              <p className="text-base font-bold tabular-nums">{bundle.kegiatan.eventBesarCount}</p>
            </div>
          </div>

          {bundle.kegiatan.agendaList.length === 0 ? (
            <p className="text-xs text-slate-500 border border-slate-200 rounded-lg p-4">
              Belum ada agenda kegiatan tercatat pada rentang periode ini.
            </p>
          ) : (
            <div className="space-y-4">
              {bundle.kegiatan.agendaList.map((ag, idx) => (
                <div
                  key={ag.id}
                  className="border border-slate-300 rounded-lg p-3.5 text-xs break-inside-avoid"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2 mb-2">
                    <h5 className="font-bold text-slate-900">
                      {idx + 1}. {ag.judul} ({ag.kategori === 'event_besar' ? 'Event Besar' : 'Rutin'})
                    </h5>
                    <span className="text-[11px] font-semibold text-slate-700">
                      Status: {ag.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px] text-slate-700 mb-2">
                    <div>
                      <span className="text-slate-500">Tanggal:</span>{' '}
                      <strong className="tabular-nums">{formatTanggalPendek(ag.tanggal)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Waktu & Lokasi:</span> {ag.jam_mulai}
                      {ag.jam_selesai ? `–${ag.jam_selesai}` : ''} WIB · {ag.lokasi || '-'}
                    </div>
                    <div>
                      <span className="text-slate-500">PJ:</span> {ag.penanggung_jawab || '-'}
                    </div>
                  </div>
                  {ag.pengisi_list.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold text-slate-700 mb-1">
                        Rincian Pengisi ({ag.pengisiProgress.terisi}/{ag.pengisiProgress.total} terisi):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 text-[11px]">
                        {ag.pengisi_list.map((slot) => (
                          <div key={slot.id} className="text-slate-700">
                            {slot.urutan}. {slot.peran}:{' '}
                            <strong className="text-slate-900">
                              {slot.petugas_nama || 'Belum diisi'}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ag.notulensi && (
                    <p className="text-[11px] text-slate-600 mt-2 border-t border-slate-100 pt-1.5">
                      <strong>Notulensi:</strong> {ag.notulensi}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* IV. PERIZINAN PULANG & V. KEAMANAN                                */}
      {/* ================================================================= */}
      {hasDiv('perizinan') && (
        <section className="mb-8">
          <SectionHeading numberLabel="IV" title="Perizinan Pulang Santri" pj="Sie Keamanan" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Izin Periode Ini</p>
              <p className="text-base font-bold tabular-nums">{bundle.perizinan.totalIzin.current}</p>
              <DeltaText delta={bundle.perizinan.totalIzin} unit=" izin" invertGood />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Menginap / Keluar</p>
              <p className="text-base font-bold tabular-nums">
                {bundle.perizinan.menginapCount} / {bundle.perizinan.tidakMenginapCount}
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Terlambat Kembali</p>
              <p className="text-base font-bold tabular-nums text-amber-700">
                {bundle.perizinan.terlambatCount.current}
              </p>
              <DeltaText delta={bundle.perizinan.terlambatCount} unit=" santri" invertGood />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Sedang Di Luar</p>
              <p className="text-base font-bold tabular-nums">{bundle.perizinan.sedangPulangCount}</p>
            </div>
          </div>

          <div className="mb-4">
            <SixPeriodTrendChart
              title={`Grafik Perbandingan Perizinan Pulang (6 ${
                bundle.window.mode === 'bulanan' ? 'Bulan' : 'Pekan'
              } Terakhir)`}
              subtitle="Jumlah pengajuan izin pulang per periode"
              points={bundle.charts.trendPoints}
              metricKey="izinPulang"
              unitLabel=""
            />
          </div>

          {bundle.perizinan.rows.length > 0 ? (
            <table className="w-full text-[11px] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-sky-50">
                  <th className="border border-slate-300 px-1.5 py-1 w-8">No</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Nama Santri</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Kamar</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Tgl Pulang</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Rencana</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Keperluan</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {bundle.perizinan.rows.map((r) => (
                  <tr key={r.no}>
                    <td className="border border-slate-300 px-1.5 py-1 text-center tabular-nums">
                      {r.no}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 font-medium">{r.nama}</td>
                    <td className="border border-slate-300 px-1.5 py-1">{r.kamar}</td>
                    <td className="border border-slate-300 px-1.5 py-1 tabular-nums">{r.tglPulang}</td>
                    <td className="border border-slate-300 px-1.5 py-1 tabular-nums">{r.tglRencana}</td>
                    <td className="border border-slate-300 px-1.5 py-1">{r.keperluan}</td>
                    <td className="border border-slate-300 px-1.5 py-1 font-semibold">
                      {r.statusLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500 border border-slate-200 rounded-lg p-3">
              Tidak ada perizinan pulang tercatat pada periode ini.
            </p>
          )}
        </section>
      )}

      {hasDiv('keamanan') && (
        <section className="mb-8">
          <SectionHeading numberLabel="V" title="Keamanan, Pelanggaran & Sita Barang" pj="Sie Keamanan" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Pelanggaran</p>
              <p className="text-base font-bold tabular-nums">{bundle.keamanan.totalKasus.current}</p>
              <DeltaText delta={bundle.keamanan.totalKasus} unit=" kasus" invertGood />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Poin Pelanggaran</p>
              <p className="text-base font-bold tabular-nums">{bundle.keamanan.totalPoin.current}</p>
              <DeltaText delta={bundle.keamanan.totalPoin} unit=" poin" invertGood />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Takzir Selesai / Belum</p>
              <p className="text-base font-bold tabular-nums">
                {bundle.keamanan.takzirSelesai} / {bundle.keamanan.takzirBelum}
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Barang Disita</p>
              <p className="text-base font-bold tabular-nums">{bundle.keamanan.sitaCount.current}</p>
              <DeltaText delta={bundle.keamanan.sitaCount} unit=" item" invertGood />
            </div>
          </div>

          <div className="mb-4">
            <SixPeriodTrendChart
              title={`Grafik Pelanggaran Santri (6 ${
                bundle.window.mode === 'bulanan' ? 'Bulan' : 'Pekan'
              } Terakhir)`}
              subtitle="Jumlah kasus pelanggaran tercatat per periode"
              points={bundle.charts.trendPoints}
              metricKey="pelanggaran"
              unitLabel=""
              accentColor="#b45309"
            />
          </div>

          {bundle.keamanan.pelanggaranRows.length > 0 ? (
            <table className="w-full text-[11px] border-collapse border border-slate-300 mb-3">
              <thead>
                <tr className="bg-amber-50">
                  <th className="border border-slate-300 px-1.5 py-1 w-8">No</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Tanggal</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Nama Santri</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Kamar</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Pelanggaran</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-center">Poin</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Takzir & Status</th>
                </tr>
              </thead>
              <tbody>
                {bundle.keamanan.pelanggaranRows.map((p) => (
                  <tr key={p.no}>
                    <td className="border border-slate-300 px-1.5 py-1 text-center tabular-nums">
                      {p.no}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 tabular-nums">{p.tanggal}</td>
                    <td className="border border-slate-300 px-1.5 py-1 font-medium">{p.nama}</td>
                    <td className="border border-slate-300 px-1.5 py-1">{p.kamar}</td>
                    <td className="border border-slate-300 px-1.5 py-1">
                      {p.pelanggaran} ({p.tingkat})
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 text-center font-bold tabular-nums">
                      {p.poin}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1">
                      {p.takzir} · <strong>{p.statusTakzir}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500 border border-slate-200 rounded-lg p-3">
              Tidak ada kasus pelanggaran tercatat pada periode ini.
            </p>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* VI. ABSEN SHOLAT JAMAAH                                           */}
      {/* ================================================================= */}
      {hasDiv('jamaah') && (
        <section className="mb-8">
          <SectionHeading numberLabel="VI" title="Absen Sholat Jama'ah 5 Waktu" pj="Sie Ibadah" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Persentase Kehadiran</p>
              <p className="text-base font-bold tabular-nums text-emerald-700">
                {bundle.jamaah.persenHadir.current}%
              </p>
              <DeltaText delta={bundle.jamaah.persenHadir} unit="%" />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Catatan Hadir</p>
              <p className="text-base font-bold tabular-nums">{bundle.jamaah.hadirCount}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Alpha</p>
              <p className="text-base font-bold tabular-nums text-rose-700">
                {bundle.jamaah.alphaCount.current}
              </p>
              <DeltaText delta={bundle.jamaah.alphaCount} unit=" alpha" invertGood />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Izin / Sakit Jamaah</p>
              <p className="text-base font-bold tabular-nums">
                {bundle.jamaah.izinCount} / {bundle.jamaah.sakitCount}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <SixPeriodTrendChart
              title={`Grafik Kehadiran Sholat Jamaah (6 ${
                bundle.window.mode === 'bulanan' ? 'Bulan' : 'Pekan'
              } Terakhir)`}
              subtitle="Persentase kehadiran santri (%) per periode"
              points={bundle.charts.trendPoints}
              metricKey="jamaahPersen"
              unitLabel="%"
            />

            <div className="border border-slate-200 rounded-xl p-4">
              <h5 className="text-xs font-bold text-slate-900 mb-2">
                Rekap Kehadiran per Waktu Sholat
              </h5>
              <table className="w-full text-xs border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-emerald-50">
                    <th className="border border-slate-300 px-2 py-1 text-left">Waktu</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Hadir</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Alpha</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Izin/Sakit</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">% Hadir</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.jamaah.perWaktu.map((w) => (
                    <tr key={w.waktu}>
                      <td className="border border-slate-300 px-2 py-1 font-medium">{w.waktu}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                        {w.hadir}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums text-rose-700">
                        {w.alpha}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                        {w.izin + w.sakit}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-bold tabular-nums">
                        {w.persenHadir}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {bundle.jamaah.topAlphaSantri.length > 0 && (
            <div className="break-inside-avoid">
              <h5 className="text-xs font-bold text-slate-800 mb-1.5">
                Daftar Santri dengan Alpha Jamaah Terbanyak Periode Ini
              </h5>
              <table className="w-full text-[11px] border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-rose-50">
                    <th className="border border-slate-300 px-2 py-1 w-8">No</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Nama Santri</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Kamar</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Alpha</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Izin</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Sakit</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.jamaah.topAlphaSantri.map((s, idx) => (
                    <tr key={`${s.nama}-${idx}`}>
                      <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 font-medium">{s.nama}</td>
                      <td className="border border-slate-300 px-2 py-1">{s.kamar}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-bold text-rose-700 tabular-nums">
                        {s.alpha}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                        {s.izin}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                        {s.sakit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* VII. KESEHATAN (POSKESTREN)                                       */}
      {/* ================================================================= */}
      {hasDiv('kesehatan') && (
        <section className="mb-8">
          <SectionHeading numberLabel="VII" title="Kesehatan & Poskestren" pj="Sie Kesehatan" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Santri Sakit Tercatat</p>
              <p className="text-base font-bold tabular-nums">{bundle.kesehatan.totalSakit.current}</p>
              <DeltaText delta={bundle.kesehatan.totalSakit} unit=" santri" invertGood />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Rawat UKS / Dirujuk</p>
              <p className="text-base font-bold tabular-nums">
                {bundle.kesehatan.dirawatUks} / {bundle.kesehatan.dirujukCount}
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Sudah Sembuh</p>
              <p className="text-base font-bold tabular-nums text-emerald-700">
                {bundle.kesehatan.sembuhCount}
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Obat Stok Menipis</p>
              <p className="text-base font-bold tabular-nums text-amber-700">
                {bundle.kesehatan.obatMenipisCount} item
              </p>
            </div>
          </div>

          <div className="mb-4">
            <SixPeriodTrendChart
              title={`Grafik Kunjungan Santri Sakit (6 ${
                bundle.window.mode === 'bulanan' ? 'Bulan' : 'Pekan'
              } Terakhir)`}
              subtitle="Jumlah santri sakit tercatat di Poskestren"
              points={bundle.charts.trendPoints}
              metricKey="santriSakit"
              unitLabel=""
              accentColor="#0284c7"
            />
          </div>

          {bundle.kesehatan.pasienRows.length > 0 ? (
            <table className="w-full text-[11px] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-sky-50">
                  <th className="border border-slate-300 px-1.5 py-1 w-8">No</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Tanggal</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Nama Santri</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Kamar</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Keluhan</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Tindakan</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {bundle.kesehatan.pasienRows.map((p) => (
                  <tr key={p.no}>
                    <td className="border border-slate-300 px-1.5 py-1 text-center tabular-nums">
                      {p.no}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 tabular-nums">{p.tglSakit}</td>
                    <td className="border border-slate-300 px-1.5 py-1 font-medium">{p.nama}</td>
                    <td className="border border-slate-300 px-1.5 py-1">{p.kamar}</td>
                    <td className="border border-slate-300 px-1.5 py-1">{p.keluhan}</td>
                    <td className="border border-slate-300 px-1.5 py-1">{p.tindakan}</td>
                    <td className="border border-slate-300 px-1.5 py-1 font-semibold">
                      {p.statusLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500 border border-slate-200 rounded-lg p-3">
              Tidak ada santri sakit tercatat pada periode ini.
            </p>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* VIII. DAPUR & KONSUMSI                                            */}
      {/* ================================================================= */}
      {hasDiv('dapur') && (
        <section className="mb-8">
          <SectionHeading numberLabel="VIII" title="Dapur Umum & Konsumsi Santri" pj="Sie Dapur" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Masak Tepat Waktu</p>
              <p className="text-base font-bold tabular-nums text-emerald-700">
                {bundle.dapur.persenTepatWaktu.current}%
              </p>
              <DeltaText delta={bundle.dapur.persenTepatWaktu} unit="%" />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Hadir Petugas Dapur</p>
              <p className="text-base font-bold tabular-nums">
                {bundle.dapur.persenHadirPetugas.current}%
              </p>
              <DeltaText delta={bundle.dapur.persenHadirPetugas} unit="%" />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Belanja / Keluar Dapur</p>
              <p className="text-base font-bold tabular-nums font-mono">
                {formatRupiah(bundle.dapur.kasKeluar.current)}
              </p>
              <DeltaText delta={bundle.dapur.kasKeluar} isCurrency invertGood />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Sesi Selesai / Terlambat</p>
              <p className="text-base font-bold tabular-nums">
                {bundle.dapur.totalSesiSelesai} sesi ({bundle.dapur.terlambatCount} telat)
              </p>
            </div>
          </div>

          {bundle.dapur.sesiRows.length > 0 ? (
            <table className="w-full text-[11px] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-emerald-50">
                  <th className="border border-slate-300 px-2 py-1 text-left">Tanggal</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Shift</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Menu Ringkas</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">PJ</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Status Waktu</th>
                </tr>
              </thead>
              <tbody>
                {bundle.dapur.sesiRows.slice(0, 20).map((s) => (
                  <tr key={s.id}>
                    <td className="border border-slate-300 px-2 py-1 tabular-nums">
                      {formatTanggalPendek(s.tanggal)}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 uppercase">{s.shift}</td>
                    <td className="border border-slate-300 px-2 py-1">{s.menu_ringkas || '-'}</td>
                    <td className="border border-slate-300 px-2 py-1">{s.petugas_pj || '-'}</td>
                    <td className="border border-slate-300 px-2 py-1 font-semibold">
                      {s.status_waktu === 'tepat_waktu'
                        ? 'Tepat Waktu'
                        : s.status_waktu === 'terlambat'
                        ? `Terlambat (${s.selisih_menit} mnt)`
                        : s.status_waktu}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500 border border-slate-200 rounded-lg p-3">
              Belum ada log sesi masak dapur pada periode ini.
            </p>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* IX. SARANA & PRASARANA                                            */}
      {/* ================================================================= */}
      {hasDiv('sarpras') && (
        <section className="mb-8">
          <SectionHeading numberLabel="IX" title="Sarana & Prasarana (Sarpras)" pj="Sie Sarpras" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Aset (Baik / Rusak)</p>
              <p className="text-base font-bold tabular-nums">
                {bundle.sarpras.totalAsetUnit} ({bundle.sarpras.asetBaikUnit} /{' '}
                {bundle.sarpras.asetRusakUnit})
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Laporan Masuk</p>
              <p className="text-base font-bold tabular-nums">{bundle.sarpras.tiketMasuk.current}</p>
              <DeltaText delta={bundle.sarpras.tiketMasuk} unit=" tiket" invertGood />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Perbaikan Selesai</p>
              <p className="text-base font-bold tabular-nums text-emerald-700">
                {bundle.sarpras.tiketSelesai.current}
              </p>
              <DeltaText delta={bundle.sarpras.tiketSelesai} unit=" selesai" />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Biaya Perbaikan</p>
              <p className="text-base font-bold tabular-nums font-mono">
                {formatRupiah(bundle.sarpras.biayaPerbaikan.current)}
              </p>
              <DeltaText delta={bundle.sarpras.biayaPerbaikan} isCurrency invertGood />
            </div>
          </div>

          {bundle.sarpras.laporanRows.length > 0 && (
            <table className="w-full text-[11px] border-collapse border border-slate-300 mb-3">
              <thead>
                <tr className="bg-amber-50">
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Tanggal</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Ruangan</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Kerusakan</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-left">Status</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-right">Biaya</th>
                </tr>
              </thead>
              <tbody>
                {bundle.sarpras.laporanRows.map((l) => (
                  <tr key={l.id}>
                    <td className="border border-slate-300 px-1.5 py-1 tabular-nums">
                      {formatTanggalPendek(l.tanggal_lapor)}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 font-medium">{l.ruangan}</td>
                    <td className="border border-slate-300 px-1.5 py-1">{l.judul_kerusakan}</td>
                    <td className="border border-slate-300 px-1.5 py-1 font-semibold uppercase">
                      {l.status}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 text-right tabular-nums font-mono">
                      {l.biaya_perbaikan > 0 ? formatRupiah(l.biaya_perbaikan) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {bundle.sarpras.inventarisKondisiSummary.length > 0 && (
            <table className="w-full text-[11px] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-2 py-1 text-left">Kategori Inventaris</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">Total Unit</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">Baik</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">Rusak Ringan</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">Rusak Berat</th>
                </tr>
              </thead>
              <tbody>
                {bundle.sarpras.inventarisKondisiSummary.map((k) => (
                  <tr key={k.kategori}>
                    <td className="border border-slate-300 px-2 py-1 font-medium">{k.kategori}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                      {k.totalUnit}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                      {k.baik}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                      {k.rusakRingan}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                      {k.rusakBerat}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* X. SIE LAUNDRY PONDOK                                             */}
      {/* ================================================================= */}
      {hasDiv('laundry') && (
        <section className="mb-8">
          <SectionHeading numberLabel="X" title="Sie Laundry Pondok" pj="Sie Laundry" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Kamar Setor</p>
              <p className="text-base font-bold tabular-nums">{bundle.laundry.totalSetoran.current}</p>
              <DeltaText delta={bundle.laundry.totalSetoran} unit=" kamar" />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Total Jumlah Potong</p>
              <p className="text-base font-bold tabular-nums">
                {bundle.laundry.totalPotong.current} pcs
              </p>
              <DeltaText delta={bundle.laundry.totalPotong} unit=" pcs" />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Status Selesai</p>
              <p className="text-base font-bold tabular-nums text-emerald-700">
                {bundle.laundry.selesaiCount}
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-slate-500">Masuk / Susulan</p>
              <p className="text-base font-bold tabular-nums">
                {bundle.laundry.masukCount} / {bundle.laundry.susulanCount}
              </p>
            </div>
          </div>

          <div className="mb-4">
            <SixPeriodTrendChart
              title={`Grafik Volume Laundry (6 ${
                bundle.window.mode === 'bulanan' ? 'Bulan' : 'Pekan'
              } Terakhir)`}
              subtitle="Total potong (pcs) cucian santri per periode"
              points={bundle.charts.trendPoints}
              metricKey="laundryPotong"
              unitLabel="pcs"
            />
          </div>

          {bundle.laundry.dailyRows.length > 0 ? (
            <table className="w-full text-[11px] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-emerald-50">
                  <th className="border border-slate-300 px-2 py-1 text-left">Hari & Tanggal</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">Kamar</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">Total Potong</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">Selesai</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Rincian Kamar & Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {bundle.laundry.dailyRows.map((d) => (
                  <tr key={d.tanggal}>
                    <td className="border border-slate-300 px-2 py-1 font-medium whitespace-nowrap">
                      {d.hariLabel}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                      {d.totalKamar}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-bold tabular-nums">
                      {d.totalPotong} pcs
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                      {d.selesaiCount}/{d.totalKamar}
                    </td>
                    <td className="border border-slate-300 px-2 py-1">{d.kamarDetail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500 border border-slate-200 rounded-lg p-3">
              Belum ada catatan setoran laundry pada periode ini.
            </p>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* LEMBAR PENGESAHAN RESMI                                           */}
      {/* ================================================================= */}
      {showCoverAndApproval && (
        <section className="mt-10 pt-6 border-t-2 border-slate-900 break-inside-avoid">
          <h3 className="text-sm font-extrabold text-center uppercase tracking-wider text-slate-900 mb-3">
            Lembar Pengesahan Laporan
          </h3>
          <p className="text-xs text-slate-700 leading-relaxed text-justify mb-6">
            Laporan ini disusun berdasarkan data operasional aktual dari seluruh sistem administrasi{' '}
            {bundle.pengaturan.nama_pesantren || 'Pondok Pesantren An-Nur 1 Bululawang'} pada{' '}
            <strong>{bundle.window.label}</strong> sebagai bahan laporan rapat rutin serta
            pertanggungjawaban pengurus kepada Pengasuh.
          </p>

          <p className="text-xs text-right text-slate-800 font-medium mb-5">
            Bululawang, {formatTanggalPendek(todayStr)}
          </p>

          {scope === 'keuangan' ? (
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              <div>
                <p className="text-slate-600">Mengetahui, Pengasuh</p>
                <div className="min-h-[4.5cm] flex items-center justify-center my-1">
                  <div className="relative inline-flex items-center justify-center">
                    {bundle.pengaturan.stempel_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bundle.pengaturan.stempel_url}
                        alt="Stempel Pondok"
                        style={{ width: '3.27cm', height: '4.5cm' }}
                        className="object-contain opacity-85 mix-blend-multiply pointer-events-none relative z-20 -mr-10 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    {bundle.pengaturan.ttd_pengasuh_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bundle.pengaturan.ttd_pengasuh_url}
                        alt="TTD Pengasuh"
                        className="max-h-20 object-contain relative z-10"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                </div>
                <p className="font-bold underline text-slate-900">
                  {bundle.pengaturan.nama_pengasuh || 'Dr. KH. A. Fahrur Rozi'}
                </p>
              </div>
              <div>
                <p className="text-slate-600">Kepala Pondok</p>
                <div className="min-h-[4.5cm] flex items-center justify-center my-1">
                  {bundle.pengaturan.ttd_kepala_pondok_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bundle.pengaturan.ttd_kepala_pondok_url}
                      alt="TTD Kepala Pondok"
                      className="max-h-20 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
                <p className="font-bold underline text-slate-900">
                  {bundle.pengaturan.nama_kepala_pondok || 'Ust. M. Fajar Wahyudi'}
                </p>
              </div>
              <div>
                <p className="text-slate-600">Bendahara Pondok</p>
                <div className="min-h-[4.5cm] flex items-center justify-center my-1">
                  {bundle.pengaturan.ttd_bendahara_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bundle.pengaturan.ttd_bendahara_url}
                      alt="TTD Bendahara"
                      className="max-h-20 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
                <p className="font-bold underline text-slate-900">
                  {bundle.pengaturan.nama_bendahara || 'Ust. Ali Nur Ikasan'}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-2 gap-6 text-center text-xs mb-6">
                <div>
                  <p className="text-slate-600">Ketua Pondok</p>
                  <div className="h-20 flex items-center justify-center my-1">
                    {bundle.pengaturan.ttd_kepala_pondok_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bundle.pengaturan.ttd_kepala_pondok_url}
                        alt="TTD Ketua Pondok"
                        className="max-h-16 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                  <p className="font-bold underline text-slate-900">
                    {bundle.pengaturan.nama_kepala_pondok || 'Ust. M. Fajar Wahyudi'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-600">Sekretaris Pondok</p>
                  <div className="h-20 flex items-center justify-center my-1">
                    {bundle.pengaturan.ttd_sekretaris_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bundle.pengaturan.ttd_sekretaris_url}
                        alt="TTD Sekretaris"
                        className="max-h-16 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                  <p className="font-bold underline text-slate-900">
                    {bundle.pengaturan.nama_sekretaris || 'Ust. Moh. Sayid Ali'}
                  </p>
                </div>
              </div>
              <div className="text-center text-xs">
                <p className="text-slate-600">
                  Mengetahui, Pengasuh{' '}
                  {bundle.pengaturan.nama_pesantren || 'Pondok Pesantren An-Nur 1 Bululawang'}
                </p>
                <div className="min-h-[4.5cm] flex items-center justify-center my-1">
                  <div className="relative inline-flex items-center justify-center">
                    {bundle.pengaturan.stempel_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bundle.pengaturan.stempel_url}
                        alt="Stempel Pondok"
                        style={{ width: '3.27cm', height: '4.5cm' }}
                        className="object-contain opacity-85 mix-blend-multiply pointer-events-none relative z-20 -mr-10 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    {bundle.pengaturan.ttd_pengasuh_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bundle.pengaturan.ttd_pengasuh_url}
                        alt="TTD Pengasuh"
                        className="max-h-20 object-contain relative z-10"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                </div>
                <p className="font-bold underline text-slate-900">
                  {bundle.pengaturan.nama_pengasuh || 'Dr. KH. A. Fahrur Rozi'}
                </p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
